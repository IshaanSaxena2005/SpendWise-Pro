/**
 * First-occurrence behaviour for recurring transactions.
 *
 * Run with:  cd Backend && node --test tests/
 *
 * These tests exercise the real service + controller code against the local
 * database. Every row they create belongs to a throwaway user that is deleted
 * again in `after()`.
 */
const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');

require('dotenv').config();
const pool = require('../config/db');
const service = require('../services/recurringExecutionService');
const controller = require('../controllers/recurringController');

const { getIstDate, calculateNextExecutionDate, createRecurringSchedule } = service;

const EMAIL = `recurring_first_occurrence_${Date.now()}@example.com`;
let userId = null;
let categoryId = null;

const today = () => getIstDate();
const daysFromToday = (days) => calculateNextExecutionDate(addDays(today(), days), 'daily');

function addDays(iso, days) {
  const [y, m, d] = iso.split('-').map(Number);
  const dt = new Date(y, m - 1, d + days);
  return `${dt.getFullYear()}-${String(dt.getMonth() + 1).padStart(2, '0')}-${String(dt.getDate()).padStart(2, '0')}`;
}

/** Transactions created for one recurring rule, oldest first.
 *  Dates are formatted by MySQL (DATE_FORMAT) rather than converted in JS:
 *  mysql2 hands back DATE columns as local-midnight Date objects, and
 *  toISOString() would shift them across a day boundary. */
async function transactionsOf(recurringId) {
  const [rows] = await pool.query(
    `SELECT id, DATE_FORMAT(expense_date, '%Y-%m-%d') AS expense_date,
            amount, note, transaction_type
       FROM expenses
      WHERE recurring_transaction_id = ? AND user_id = ?
      ORDER BY expense_date ASC, id ASC`,
    [recurringId, userId]
  );
  return rows;
}

async function ruleOf(recurringId) {
  const [rows] = await pool.query(
    `SELECT id,
            DATE_FORMAT(start_date, '%Y-%m-%d') AS start_date,
            DATE_FORMAT(next_execution_date, '%Y-%m-%d') AS next_execution_date,
            is_active, frequency
       FROM recurring_transactions WHERE id = ? AND user_id = ?`,
    [recurringId, userId]
  );
  return rows[0] || null;
}

const baseRule = (overrides = {}) => ({
  userId,
  type: 'expense',
  amount: 500,
  category_id: categoryId,
  note: 'Bills',
  frequency: 'monthly',
  start_date: today(),
  never_ends: true,
  ...overrides,
});

/** Minimal req/res doubles so controller handlers can be called directly. */
function fakeExchange({ body = {}, params = {} } = {}) {
  const res = {
    statusCode: 200,
    payload: null,
    status(code) { this.statusCode = code; return this; },
    json(obj) { this.payload = obj; return this; },
  };
  return { req: { user: { id: userId, email: EMAIL }, body, params }, res };
}

before(async () => {
  const [u] = await pool.query(
    `INSERT INTO users (full_name, email, password_hash, is_verified, auth_provider, has_local_password)
     VALUES ('Recurring Tests', ?, 'x', TRUE, 'email', TRUE)`,
    [EMAIL]
  );
  userId = u.insertId;
  const [c] = await pool.query('INSERT INTO categories (user_id, name) VALUES (?, ?)', [userId, 'Bills']);
  categoryId = c.insertId;
});

after(async () => {
  await pool.query('DELETE FROM notifications WHERE user_id = ?', [userId]);
  await pool.query('DELETE FROM expenses WHERE user_id = ?', [userId]);
  await pool.query('DELETE FROM recurring_transactions WHERE user_id = ?', [userId]);
  await pool.query('DELETE FROM categories WHERE user_id = ?', [userId]);
  await pool.query('DELETE FROM refresh_tokens WHERE user_id = ?', [userId]);
  await pool.query('DELETE FROM users WHERE id = ?', [userId]);
  await pool.end();
});

test('A. monthly recurring starting today creates exactly one transaction and advances one month', async () => {
  const created = await createRecurringSchedule(baseRule({ frequency: 'monthly' }));

  const txns = await transactionsOf(created.id);
  assert.equal(txns.length, 1, 'exactly one first transaction');
  assert.equal(txns[0].expense_date, today(), 'dated today');
  assert.equal(Number(txns[0].amount), 500);
  assert.equal(txns[0].transaction_type, 'expense');

  const rule = await ruleOf(created.id);
  assert.equal(
    rule.next_execution_date,
    calculateNextExecutionDate(today(), 'monthly'),
    'advanced to the next monthly occurrence'
  );
  assert.notEqual(rule.next_execution_date, today(), 'no longer due today');
});

test('A2. first occurrence keeps the title/goal supplied for that first transaction', async () => {
  const [goal] = await pool.query(
    `INSERT INTO goals (user_id, name, target_amount, saved_amount, target_date, priority)
     VALUES (?, 'Rent fund', 1000, 0, ?, 'Medium')`,
    [userId, daysFromToday(90)]
  );
  const created = await createRecurringSchedule(
    baseRule({ frequency: 'monthly', title: 'Electricity bill', goal_id: goal.insertId })
  );

  const [rows] = await pool.query('SELECT title, goal_id FROM expenses WHERE recurring_transaction_id = ?', [created.id]);
  assert.equal(rows.length, 1);
  assert.equal(rows[0].title, 'Electricity bill');
  assert.equal(Number(rows[0].goal_id), Number(goal.insertId));

  await pool.query('DELETE FROM goals WHERE id = ?', [goal.insertId]);
});

test('B. weekly recurring starting today creates exactly one transaction and advances one week', async () => {
  const created = await createRecurringSchedule(baseRule({ frequency: 'weekly' }));

  const txns = await transactionsOf(created.id);
  assert.equal(txns.length, 1);
  assert.equal(txns[0].expense_date, today());

  const rule = await ruleOf(created.id);
  assert.equal(rule.next_execution_date, calculateNextExecutionDate(today(), 'weekly'));
});

test('C. future start date creates nothing early and stays scheduled on the start date', async () => {
  const startDate = daysFromToday(45);
  const created = await createRecurringSchedule(baseRule({ start_date: startDate }));

  assert.equal((await transactionsOf(created.id)).length, 0, 'no transaction before the start date');
  assert.equal(created.firstTransaction.reason, 'not_due');

  const rule = await ruleOf(created.id);
  assert.equal(rule.next_execution_date, startDate, 'scheduled exactly on the start date');
  assert.equal(rule.start_date, startDate);
});

test('D. an overdue rule is caught up one occurrence at a time', async () => {
  // A start date already in the past is due immediately: the first occurrence
  // runs on create, and the rule advances a single period (never
  // back-filling every missed period at once).
  const startDate = daysFromToday(-61);
  const created = await createRecurringSchedule(baseRule({ start_date: startDate }));

  const afterCreate = await transactionsOf(created.id);
  assert.equal(afterCreate.length, 1, 'only the first overdue occurrence is created');
  assert.equal(afterCreate[0].expense_date, startDate);
  assert.equal(
    (await ruleOf(created.id)).next_execution_date,
    calculateNextExecutionDate(startDate, 'monthly')
  );

  // Still behind: the scheduler picks up one more occurrence per run.
  const overdue = calculateNextExecutionDate(daysFromToday(-31), 'monthly');
  await pool.query('UPDATE recurring_transactions SET next_execution_date = ? WHERE id = ?', [overdue, created.id]);

  await service.processDueRecurringTransactions();

  const txns = await transactionsOf(created.id);
  assert.equal(txns.length, 2, 'catch-up created exactly the overdue occurrence');
  assert.equal(txns[1].expense_date, overdue);
  assert.equal(
    (await ruleOf(created.id)).next_execution_date,
    calculateNextExecutionDate(overdue, 'monthly'),
    'advanced one period past the caught-up occurrence'
  );
});

test('E. editing a schedule that already executed does not re-create that transaction', async () => {
  const created = await createRecurringSchedule(baseRule({ frequency: 'monthly' }));
  assert.equal((await transactionsOf(created.id)).length, 1, 'first occurrence exists before the edit');

  // Edit exactly like the recurring management modal does.
  const { req, res } = fakeExchange({
    params: { id: created.id },
    body: {
      amount: 750, category_id: categoryId, note: 'Bills', frequency: 'monthly',
      start_date: today(), never_ends: true,
    },
  });
  await controller.updateRecurringTransaction(req, res);
  assert.equal(res.statusCode, 200, res.payload && res.payload.message);

  const afterEdit = await ruleOf(created.id);
  assert.notEqual(
    afterEdit.next_execution_date, today(),
    'edit must not point the schedule back at the already-executed occurrence'
  );

  await service.processDueRecurringTransactions();

  const txns = await transactionsOf(created.id);
  assert.equal(txns.length, 1, 'still exactly one transaction — the edit produced no duplicate');
});

test('E2. editing a schedule with a future start keeps it scheduled in the future', async () => {
  const startDate = daysFromToday(20);
  const created = await createRecurringSchedule(baseRule({ start_date: startDate }));

  const { req, res } = fakeExchange({
    params: { id: created.id },
    body: {
      amount: 500, category_id: categoryId, note: 'Bills', frequency: 'monthly',
      start_date: startDate, never_ends: true,
    },
  });
  await controller.updateRecurringTransaction(req, res);
  assert.equal(res.statusCode, 200);

  const rule = await ruleOf(created.id);
  assert.equal(rule.next_execution_date, startDate);
  assert.equal((await transactionsOf(created.id)).length, 0, 'no early transaction');
});

test('F. pause, resume and delete behave unchanged', async () => {
  const created = await createRecurringSchedule(baseRule());
  const initial = await transactionsOf(created.id);
  assert.equal(initial.length, 1);

  let { req, res } = fakeExchange({ params: { id: created.id } });
  await controller.pauseRecurringTransaction(req, res);
  assert.equal(res.statusCode, 200);
  assert.equal((await ruleOf(created.id)).is_active, 0);
  assert.equal((await transactionsOf(created.id)).length, 1, 'pause creates nothing');

  ({ req, res } = fakeExchange({ params: { id: created.id } }));
  await controller.resumeRecurringTransaction(req, res);
  assert.equal(res.statusCode, 200);
  assert.equal((await ruleOf(created.id)).is_active, 1);
  assert.equal((await transactionsOf(created.id)).length, 1, 'resume creates nothing');

  ({ req, res } = fakeExchange({ params: { id: created.id } }));
  await controller.deleteRecurringTransaction(req, res);
  assert.equal(res.statusCode, 200);
  assert.equal(await ruleOf(created.id), null, 'rule deleted');

  const [orphans] = await pool.query('SELECT id FROM expenses WHERE recurring_transaction_id = ?', [created.id]);
  assert.equal(orphans.length, 1, 'the already-created transaction survives rule deletion');
});

test('G. running the scheduler repeatedly never duplicates the same occurrence', async () => {
  const created = await createRecurringSchedule(baseRule({ frequency: 'monthly' }));
  const firstRun = (await transactionsOf(created.id)).length;
  assert.equal(firstRun, 1);

  for (let i = 0; i < 3; i++) {
    await service.processDueRecurringTransactions();
  }
  assert.equal((await transactionsOf(created.id)).length, 1, 'still one transaction after repeated cron runs');

  // When the next occurrence genuinely comes due, it runs exactly once.
  // Point the rule at a past occurrence that has no transaction yet.
  const dueDate = daysFromToday(-5);
  await pool.query('UPDATE recurring_transactions SET next_execution_date = ? WHERE id = ?', [dueDate, created.id]);

  await service.processDueRecurringTransactions();
  const afterDue = await transactionsOf(created.id);
  assert.equal(afterDue.length, 2, 'the due occurrence was created');
  assert.equal(afterDue[0].expense_date, dueDate, 'dated the occurrence that was due');

  await service.processDueRecurringTransactions();
  assert.equal((await transactionsOf(created.id)).length, 2, 'and never duplicated on the next run');
});

test('H. skip_first_transaction leaves an existing first transaction alone', async () => {
  const startDate = daysFromToday(7);
  const created = await createRecurringSchedule(
    baseRule({ start_date: startDate, skipFirstOccurrence: true })
  );

  assert.equal((await transactionsOf(created.id)).length, 0, 'no transaction created by the backend');
  const rule = await ruleOf(created.id);
  assert.equal(
    rule.next_execution_date,
    calculateNextExecutionDate(startDate, 'monthly'),
    'anchored one period past the existing first transaction'
  );
});

test('I. first_transaction_date overrides the start date for the first occurrence only', async () => {
  const startDate = daysFromToday(30);
  const firstDate = today();
  const created = await createRecurringSchedule(
    baseRule({ start_date: startDate, first_transaction_date: firstDate })
  );

  const txns = await transactionsOf(created.id);
  assert.equal(txns.length, 1);
  assert.equal(txns[0].expense_date, firstDate, 'the transaction the user typed is the first occurrence');

  const rule = await ruleOf(created.id);
  assert.equal(rule.start_date, startDate, 'the rule keeps its own start date');
  assert.equal(
    rule.next_execution_date,
    calculateNextExecutionDate(firstDate, 'monthly'),
    'cadence continues from the first occurrence'
  );
});

test('J. rollover-safe date arithmetic is preserved', () => {
  assert.equal(calculateNextExecutionDate('2026-08-28', 'weekly'), '2026-09-04');
  assert.equal(calculateNextExecutionDate('2026-12-30', 'weekly'), '2027-01-06');
  assert.equal(calculateNextExecutionDate('2026-01-31', 'monthly'), '2026-02-28');
  assert.equal(calculateNextExecutionDate('2026-08-02', 'monthly'), '2026-09-02');
  assert.equal(calculateNextExecutionDate('2028-02-29', 'yearly'), '2029-02-28');
});

test('K. the HTTP create endpoint returns the first transaction it created', async () => {
  const { req, res } = fakeExchange({
    body: {
      type: 'expense', amount: 500, category_id: categoryId, note: 'Bills',
      frequency: 'monthly', start_date: today(), never_ends: true,
    },
  });
  await controller.createRecurringTransaction(req, res);

  assert.equal(res.statusCode, 200);
  assert.equal(res.payload.success, true);
  assert.equal(res.payload.firstTransaction.status, 'succeeded');
  assert.ok(res.payload.firstTransaction.transactionId, 'reports the created transaction id');
  assert.equal((await transactionsOf(res.payload.id)).length, 1);
});
