/**
 * Anomaly-alert-deletion regression tests (bell + orphan cleanup fix).
 *
 * Previous audit proved: deleting the expense DOES remove its anomaly
 * notification (FK cascade + defensive cleanup in deleteExpense), and the
 * /anomaly/check dashboard list already hides orphaned rows. The remaining
 * bugs (this suite) were:
 *   1. GET /api/notifications (the bell) returned legacy orphan anomaly rows
 *      (expense_id = NULL, pre-fix) — nothing filtered the raw SELECT *.
 *   2. Nothing purged those legacy orphans from TiDB production (they kept
 *      resurfacing on every login since their expense link is unknowable).
 *
 * Covers:
 *   1. deleting an expense removes its linked anomaly notification
 *   2. it stays gone after re-fetching both notification surfaces
 *   3. legacy orphan (expense_id = NULL) is not returned by /notifications
 *   4. deleting user A's transaction can't remove user B's notification
 *   5. unrelated (budget/goal/recurring) notifications remain intact
 *   6. deletion still succeeds when notification cleanup fails
 *   7. startup migration purges legacy orphans (simulating production state)
 *   8. getNotifications falls back safely when the migration is missing
 */
const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');

require('dotenv').config();
const pool = require('../config/db');
const { ensureAnomalyNotificationSchema } = require('../services/startupMigrations');
const notificationController = require('../controllers/notificationController');
const expenseController = require('../controllers/expenseController');
const { ensureCategory } = require('./helpers/ensureCategory');

const EMAIL = `bell_fix_${Date.now()}@example.com`;
const USER_B_EMAIL = `bell_fix_b_${Date.now()}@example.com`;
let userId = null;
let userBId = null;
let categoryId = null;

/** Minimal req/res doubles so controller handlers can be called directly. */
function fakeExchange({ body = {}, params = {}, user = null } = {}) {
  const res = {
    statusCode: 200,
    payload: null,
    status(code) { this.statusCode = code; return this; },
    json(obj) { this.payload = obj; return this; },
  };
  return { req: { user: user || { id: userId, email: EMAIL }, body, params }, res };
}

/** Calls getNotifications like the route does, and returns res. */
async function getNotificationsViaController(user = null) {
  const { req, res } = fakeExchange({ user });
  await notificationController.getNotifications(req, res);
  return res;
}

async function insertExpense(overrides = {}) {
  const row = { userId, categoryId, amount: 500, note: 'Taxi', ...overrides };
  const [r] = await pool.query(
    `INSERT INTO expenses (user_id, category_id, amount, expense_date, note, transaction_type)
     VALUES (?, ?, ?, CURDATE(), ?, 'expense')`,
    [row.userId, row.categoryId, row.amount, row.note]
  );
  return r.insertId;
}

async function anomalyCount(uid = userId) {
  const [rows] = await pool.query(
    `SELECT COUNT(*) AS n FROM notifications WHERE user_id = ? AND type = 'anomaly'`,
    [uid]
  );
  return Number(rows[0].n);
}

before(async () => {
  // Idempotent — guarantees the column exists regardless of file order
  // (node --test runs files in parallel against one shared database).
  await ensureAnomalyNotificationSchema();

  const [u] = await pool.query(
    `INSERT INTO users (full_name, email, password_hash, is_verified, auth_provider, has_local_password)
     VALUES ('Bell Fix Tests', ?, 'x', TRUE, 'email', TRUE)`,
    [EMAIL]
  );
  userId = u.insertId;
  const [ub] = await pool.query(
    `INSERT INTO users (full_name, email, password_hash, is_verified, auth_provider, has_local_password)
     VALUES ('Bell Fix Tests B', ?, 'x', TRUE, 'email', TRUE)`,
    [USER_B_EMAIL]
  );
  userBId = ub.insertId;
  categoryId = await ensureCategory(userId, 'Travel');
});

after(async () => {
  await pool.query('DELETE FROM notifications WHERE user_id IN (?, ?)', [userId, userBId]);
  await pool.query('DELETE FROM expenses WHERE user_id IN (?, ?)', [userId, userBId]);
  await pool.query('DELETE FROM categories WHERE user_id IN (?, ?)', [userId, userBId]);
  await pool.query('DELETE FROM users WHERE id IN (?, ?)', [userId, userBId]);
  await pool.end();
});

// ── 1 + 2+3: linked deletion + persistence across re-fetches ────────────────

test('deleting the expense removes its linked anomaly alert for BOTH surfaces, persistent on re-fetch', async () => {
  // Seed exactly what POST /expenses/add produces for an anomalous expense:
  // an expense + a type='anomaly' notification linked via expense_id.
  const [expense] = await pool.query(
    `INSERT INTO expenses (user_id, category_id, amount, expense_date, note, transaction_type)
     VALUES (?, ?, 5000, CURDATE(), 'Taxi', 'expense')`,
    [userId, categoryId]
  );
  const [notif] = await pool.query(
    `INSERT INTO notifications (user_id, title, description, type, read_status, expense_id)
     VALUES (?, 'Unusual spending detected', 'big one', 'anomaly', FALSE, ?)`,
    [userId, expense.insertId]
  );

  // Precondition: the bell currently shows the alert.
  let bell = await getNotificationsViaController();
  assert.ok(bell.payload.data.some((n) => n.id === notif.insertId), 'bell shows the linked alert before deletion');

  // Scenario-1 delete via the real controller (user A).
  const { req, res } = fakeExchange({ params: { id: String(expense.insertId) } });
  await expenseController.deleteExpense(req, res);
  assert.equal(res.statusCode, 200);

  const [stillThere] = await pool.query('SELECT id FROM notifications WHERE id = ?', [notif.insertId]);
  assert.equal(stillThere.length, 0, 'notification physically deleted from the DB');

  // Scenario-2/3: both surfaces stay clean on repeated re-fetches.
  bell = await getNotificationsViaController();
  const bellIds = bell.payload.data.map((n) => n.id);
  assert.ok(!bellIds.includes(notif.insertId), 'bell no longer includes the deleted alert');
  bell = await getNotificationsViaController();
  assert.ok(!bell.payload.data.some((n) => n.id === notif.insertId), 'still gone on a second refetch');
  assert.equal(await anomalyCount(), 0);
});

// ── 3b: the documented pre-fix legacy orphan must not surface ───────────────

test('legacy orphan anomaly row (expense_id NULL) is NOT returned by the bell', async () => {
  const [legacy] = await pool.query(
    `INSERT INTO notifications (user_id, title, description, type, read_status)
     VALUES (?, 'Unusual spending detected', 'legacy ₹1 Travel alert', 'anomaly', FALSE)`,
    [userId]
  );
  const res = await getNotificationsViaController();
  assert.ok(!res.payload.data.some((n) => n.id === legacy.insertId), 'legacy orphan hidden from the bell');
  // Health of the endpoint: other rows still come through.
  const [fresh] = await pool.query(
    `INSERT INTO notifications (user_id, title, description, type, read_status)
     VALUES (?, 'Budget alert', 'keep me in the bell', 'budget', FALSE)`,
    [userId]
  );
  const res2 = await getNotificationsViaController();
  assert.ok(res2.payload.data.some((n) => n.id === fresh.insertId), 'non-anomaly rows unaffected by orphan filter');
  await pool.query('DELETE FROM notifications WHERE id IN (?, ?)', [legacy.insertId, fresh.insertId]);
});

// ── 4: user isolation of the delete path ────────────────────────────────────

test("deleting user A's expense cannot remove user B's notification", async () => {
  const [expenseB] = await pool.query(
    `INSERT INTO expenses (user_id, category_id, amount, expense_date, note, transaction_type)
     VALUES (?, ?, 4000, CURDATE(), 'Flight B', 'expense')`,
    [userBId, categoryId]
  );
  const [notifB] = await pool.query(
    `INSERT INTO notifications (user_id, title, description, type, read_status, expense_id)
     VALUES (?, 'Unusual spending detected', 'B own alert', 'anomaly', FALSE, ?)`,
    [userBId, expenseB.insertId]
  );

  // User A calls DELETE with user B's expense id — scoped delete = 404.
  const { req, res } = fakeExchange({ params: { id: String(expenseB.insertId) } });
  await expenseController.deleteExpense(req, res);
  assert.equal(res.statusCode, 404, "cross-user delete must 404 on the expense");

  const [both] = await pool.query(
    'SELECT id FROM expenses WHERE id = ?', [expenseB.insertId]
  );
  assert.equal(both.length, 1, 'user B expense untouched');
  const [notifRows] = await pool.query('SELECT id FROM notifications WHERE id = ?', [notifB.insertId]);
  assert.equal(notifRows.length, 1, 'user B alert survives');

  // Bell scoped per-user: A's call never lists B's alert.
  const bellA = await getNotificationsViaController();
  assert.ok(!bellA.payload.data.some((n) => n.user_id !== userId), "A's bell contains only A's rows");
  const bellB = await getNotificationsViaController({ id: userBId, email: USER_B_EMAIL });
  assert.ok(bellB.payload.data.some((n) => n.id === notifB.insertId), 'B still sees their alert in their bell');

  await pool.query('DELETE FROM notifications WHERE id = ?', [notifB.insertId]);
  await pool.query('DELETE FROM expenses WHERE id = ?', [expenseB.insertId]);
});

// ── 5: unrelated notifications remain intact through a deletion ────────────

test('expense deletion leaves budget/goal/recurring notifications untouched', async () => {
  const [budget] = await pool.query(
    `INSERT INTO notifications (user_id, title, description, type, read_status)
     VALUES (?, 'Budget alert', 'keep me', 'budget', FALSE)`,
    [userId]
  );
  const [goal] = await pool.query(
    `INSERT INTO notifications (user_id, title, description, type, read_status)
     VALUES (?, 'Goal behind schedule', 'keep me', 'goal_behind', FALSE)`,
    [userId]
  );
  const [recurring] = await pool.query(
    `INSERT INTO notifications (user_id, title, description, type, read_status)
     VALUES (?, 'Recurring transaction created', 'keep me', 'recurring', FALSE)`,
    [userId]
  );

  const id = await insertExpense({ amount: 120 });
  const { req, res } = fakeExchange({ params: { id: String(id) } });
  await expenseController.deleteExpense(req, res);
  assert.equal(res.statusCode, 200);

  const [after] = await pool.query(
    'SELECT id FROM notifications WHERE id IN (?, ?, ?)',
    [budget.insertId, goal.insertId, recurring.insertId]
  );
  assert.equal(after.length, 3, 'all three unrelated notifications survived');

  const listing = await getNotificationsViaController();
  const ids = listing.payload.data.map((n) => n.id);
  for (const i of [budget.insertId, goal.insertId, recurring.insertId]) {
    assert.ok(ids.includes(i), `notification ${i} still in the bell`);
  }

  await pool.query('DELETE FROM notifications WHERE id IN (?, ?, ?)', [budget.insertId, goal.insertId, recurring.insertId]);
});

// ── 6: deletion survives a failed notification cleanup ─────────────────────

test('expense deletion still succeeds when notification cleanup errors (non-critical)', async () => {
  const id = await insertExpense({ amount: 200 });

  // Simulate a broken notifications table (e.g. permissions) — the DELETE of
  // the expense must still go through.
  const originalQuery = pool.query.bind(pool);
  let calls = 0;
  pool.query = async (sql, params, ...rest) => {
    calls += 1;
    if (typeof sql === 'string' && sql.includes('DELETE FROM notifications') && calls >= 2) {
      throw new Error('simulated notifications-table outage');
    }
    return originalQuery(sql, params, ...rest);
  };
  try {
    const { req, res } = fakeExchange({ params: { id: String(id) } });
    await expenseController.deleteExpense(req, res);
    assert.equal(res.statusCode, 200, 'expense deletion must succeed despite cleanup failure');
    assert.equal(res.payload.success, true);
  } finally {
    pool.query = originalQuery;
  }

  const [gone] = await pool.query('SELECT id FROM expenses WHERE id = ?', [id]);
  assert.equal(gone.length, 0, 'expense actually deleted');
});

// ── 7: the startup migration purges legacy orphans (production heal) ────────

test('startup migration purges legacy orphan anomaly notifications (expense_id NULL)', async () => {
  await pool.query(
    `INSERT INTO notifications (user_id, title, description, type, read_status)
     VALUES (?, 'Unusual spending detected', 'pre-fix row', 'anomaly', FALSE)`,
    [userId]
  );
  assert.equal(await anomalyCount(), 1);

  await ensureAnomalyNotificationSchema();
  const count = await anomalyCount();
  assert.equal(count, 0, 'legacy orphan purged by the migration step');
});

// ── 8: missing migration (no expense_id column) degrades safely ────────────

test('getNotifications degrades without expense_id column: anomaly rows hidden, endpoint works', async () => {
  // Simulate the pre-migration schema by dropping the FK then the column
  // (MySQL refuses to drop a column that an FK still references).
  try { await pool.query('ALTER TABLE notifications DROP FOREIGN KEY fk_notifications_expense'); } catch { /* may not exist if a parallel suite is mid-heal */ }
  await pool.query('ALTER TABLE notifications DROP COLUMN expense_id');
  try {
    const res = await getNotificationsViaController(); // must not throw
    assert.equal(res.statusCode, 200);
    assert.equal(res.payload.success, true);
    const types = res.payload.data.map((n) => n.type);
    assert.ok(!types.includes('anomaly'), 'un-linkable anomaly rows (all of them) hidden pre-migration');
    // Non-anomaly types still flow through.
    const [fresh] = await pool.query(
      `INSERT INTO notifications (user_id, title, description, type, read_status)
       VALUES (?, 'Budget alert', 'keep me', 'budget', FALSE)`,
      [userId]
    );
    const res2 = await getNotificationsViaController();
    assert.ok(res2.payload.data.some((n) => n.id === fresh.insertId), 'non-anomaly rows still returned');
    await pool.query('DELETE FROM notifications WHERE id = ?', [fresh.insertId]);
  } finally {
    // Restore the schema exactly as ensureAnomalyNotificationSchema leaves it.
    await ensureAnomalyNotificationSchema();
  }
});
