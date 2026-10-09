/**
 * Anomaly detection regression tests (anomaly-alert audit fix).
 *
 * Run with:  cd Backend && node --test tests/
 *
 * Covers the fix end to end against the real database:
 *   - MIN_HISTORY = 10 gate (9 vs 10 previous expenses)
 *   - MIN_ANOMALY_AMOUNT = 20 guard (₹1 / ₹19 blocked; ₹20 still history-gated)
 *   - the current expense is excluded from its own history (by id)
 *   - income transactions are excluded from the history
 *   - ML verdicts pass through with reasons; low/anomalous is suppressed
 *   - anomaly notifications carry expense_id (duplicate-proof)
 *   - deleting the expense removes its alert (FK cascade + defensive cleanup)
 *   - user isolation for history, alerts and the dashboard query
 *   - budget/goal/recurring notifications are untouched
 *
 * The ML service is stubbed at axios.post (the shared axios object the
 * service requires), so verdicts are deterministic and no network is needed.
 */
const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const axios = require('axios');

require('dotenv').config();
const pool = require('../config/db');
const { ensureCategory } = require('./helpers/ensureCategory');
const {
  checkAnomaly,
  getAnomalyHistory,
  createAnomalyNotificationOnce,
  MIN_HISTORY,
  MIN_ANOMALY_AMOUNT,
} = require('../services/anomalyService');
const { ensureAnomalyNotificationSchema } = require('../services/startupMigrations');
const expenseController = require('../controllers/expenseController');

const EMAIL = `anomaly_fix_${Date.now()}@example.com`;
const USER_B_EMAIL = `anomaly_fix_b_${Date.now()}@example.com`;
let userId = null;
let userBId = null;

let realAxiosPost = null;
let currentCategoryId = null; // default category for insertExpense/addExpenseViaController

/** Patch axios.post on the shared axios object for the duration of a test. */
function stubAxiosPost(impl) {
  realAxiosPost = axios.post;
  axios.post = impl;
}

function restoreAxiosPost() {
  if (realAxiosPost) {
    axios.post = realAxiosPost;
    realAxiosPost = null;
  }
}

async function insertExpense(overrides = {}) {
  const row = {
    userId,
    categoryId: 0, // resolved from overrides or the current test's category
    amount: 500,
    note: 'Taxi',
    type: 'expense',
    ...overrides,
  };
  if (!row.categoryId) {
    row.categoryId = row.categoryId === 0 ? (currentCategoryId || (await ensureCategory(row.userId, 'Travel')))
                                          : row.categoryId;
  }
  const [r] = await pool.query(
    `INSERT INTO expenses (user_id, category_id, amount, expense_date, note, transaction_type)
     VALUES (?, ?, ?, CURDATE(), ?, ?)`,
    [row.userId, row.categoryId, row.amount, row.note, row.type]
  );
  return r.insertId;
}

async function seedPreviousExpenses(count, overrides = {}) {
  for (let i = 0; i < count; i++) {
    await insertExpense({ note: `Taxi ${i}`, ...overrides });
  }
}

async function countAnomalyNotifications(uid = userId) {
  const [rows] = await pool.query(
    `SELECT COUNT(*) AS n FROM notifications WHERE user_id = ? AND type = 'anomaly'`,
    [uid]
  );
  return Number(rows[0].n);
}

/** Minimal req/res doubles so controller handlers can be called directly. */
function fakeExchange({ body = {}, params = {}, user = null } = {}) {
  const res = {
    statusCode: 200,
    payload: null,
    status(code) { this.statusCode = code; return this; },
    json(obj) { this.payload = obj; return this; },
  };
  return {
    req: { user: user || { id: userId, email: EMAIL }, body, params },
    res,
  };
}

async function addExpenseViaController(bodyOverrides = {}, user = null) {
  const body = {
    category_id: currentCategoryId,
    amount: 500,
    expense_date: new Date().toISOString().slice(0, 10),
    title: 'Taxi',
    transaction_type: 'expense',
    ...bodyOverrides,
  };
  const { req, res } = fakeExchange({ body, user });
  await expenseController.addExpense(req, res);
  return res;
}

async function deleteExpenseViaController(id, user = null) {
  const { req, res } = fakeExchange({ params: { id: String(id) }, user });
  await expenseController.deleteExpense(req, res);
  return res;
}

before(async () => {
  // This suite needs notifications.expense_id to exist; the idempotent
  // startup-migration step guarantees it regardless of file execution order
  // (node --test runs files in parallel against one shared database).
  await ensureAnomalyNotificationSchema();

  const [u] = await pool.query(
    `INSERT INTO users (full_name, email, password_hash, is_verified, auth_provider, has_local_password)
     VALUES ('Anomaly Tests', ?, 'x', TRUE, 'email', TRUE)`,
    [EMAIL]
  );
  userId = u.insertId;

  const [ub] = await pool.query(
    `INSERT INTO users (full_name, email, password_hash, is_verified, auth_provider, has_local_password)
     VALUES ('Anomaly Tests B', ?, 'x', TRUE, 'email', TRUE)`,
    [USER_B_EMAIL]
  );
  userBId = ub.insertId;

  currentCategoryId = await ensureCategory(userId, 'Travel');
});

after(async () => {
  restoreAxiosPost();
  await pool.query('DELETE FROM notifications WHERE user_id IN (?, ?)', [userId, userBId]);
  await pool.query('DELETE FROM expenses WHERE user_id IN (?, ?)', [userId, userBId]);
  await pool.query('DELETE FROM categories WHERE user_id IN (?, ?)', [userId, userBId]);
  await pool.query('DELETE FROM users WHERE id IN (?, ?)', [userId, userBId]);
  await pool.end();
});

// ── Gates ────────────────────────────────────────────────────────────────────

test('guards expose the audited constants (MIN_HISTORY=10, MIN_ANOMALY_AMOUNT=20)', () => {
  assert.equal(MIN_HISTORY, 10);
  assert.equal(MIN_ANOMALY_AMOUNT, 20);
});

test('₹1 and ₹19 are rejected before any DB/ML work (amount_below_threshold)', async () => {
  stubAxiosPost(async () => { throw new Error('ML must not be called for trivial amounts'); });
  try {
    for (const amount of [1, 19]) {
      const result = await checkAnomaly(userId, amount, null, null);
      assert.deepEqual(result, { is_anomaly: false, reason: 'amount_below_threshold' });
    }
    assert.equal(await countAnomalyNotifications(), 0);
  } finally {
    restoreAxiosPost();
  }
});

test('₹20 passes the amount gate but still requires the full 10-expense baseline', async () => {
  const cid = await ensureCategory(userId, 'Travel-amount20');
  await seedPreviousExpenses(3, { categoryId: cid });
  stubAxiosPost(async () => { throw new Error('ML must not be called below MIN_HISTORY'); });
  try {
    const id = await insertExpense({ categoryId: cid, amount: 20 });
    const result = await checkAnomaly(userId, 20, cid, id);
    assert.deepEqual(result, { is_anomaly: false, reason: 'insufficient_history' });
    assert.equal(await countAnomalyNotifications(), 0);
  } finally {
    restoreAxiosPost();
  }
});

test('9 previous expenses → insufficient_history, ML never called, no notification', async () => {
  const cid = await ensureCategory(userId, 'Travel-hist9');
  await seedPreviousExpenses(9, { categoryId: cid });
  stubAxiosPost(async () => { throw new Error('ML must not be called below MIN_HISTORY'); });
  try {
    const id = await insertExpense({ categoryId: cid });
    const result = await checkAnomaly(userId, 500, cid, id);
    assert.deepEqual(result, { is_anomaly: false, reason: 'insufficient_history' });
    assert.equal(await countAnomalyNotifications(), 0);
  } finally {
    restoreAxiosPost();
  }
});

test('10 previous expenses → ML is called with exactly those 10 amounts and the API key', async () => {
  const cid = await ensureCategory(userId, 'Travel-hist10');
  await seedPreviousExpenses(10, { categoryId: cid });
  let seen = null;
  stubAxiosPost(async (url, payload, config) => {
    seen = { url, payload, config };
    return { data: { is_anomaly: false, reason: 'not_anomaly', anomaly_score: 0.2 } };
  });
  try {
    const id = await insertExpense({ categoryId: cid });
    const result = await checkAnomaly(userId, 500, cid, id);
    assert.equal(seen.url, `${process.env.ML_SERVICE_URL}/anomaly`, 'posts to the configured ML endpoint');
    assert.equal(seen.payload.current_expense, 500);
    assert.equal(seen.payload.history.length, 10, 'only the 10 previous expenses');
    assert.ok(seen.payload.history.every((a) => a === 500));
    assert.equal(seen.config.headers['x-ml-api-key'], process.env.ML_API_KEY || '', 'forwards the configured ML API key');
    assert.deepEqual(result, { is_anomaly: false, reason: 'not_anomaly' });
    assert.equal(await countAnomalyNotifications(), 0);
  } finally {
    restoreAxiosPost();
  }
});

// ── History correctness ──────────────────────────────────────────────────────

test('the current expense is excluded from its own history by id', async () => {
  const cid = await ensureCategory(userId, 'Travel-self');
  await seedPreviousExpenses(10, { categoryId: cid, amount: 500 });
  const id = await insertExpense({ categoryId: cid, amount: 9999 });
  let seen = null;
  stubAxiosPost(async (url, payload) => {
    seen = payload;
    return { data: { is_anomaly: false, reason: 'not_anomaly' } };
  });
  try {
    await checkAnomaly(userId, 9999, cid, id);
    assert.ok(!seen.history.includes(9999), 'current amount must not be in its own history');
    assert.equal(seen.history.length, 10);
  } finally {
    restoreAxiosPost();
  }
});

test('income transactions are excluded from the history', async () => {
  const cid = await ensureCategory(userId, 'Travel-income');
  await seedPreviousExpenses(10, { categoryId: cid, amount: 500 });
  await insertExpense({ categoryId: cid, amount: 75000, type: 'income', note: 'salary-ish refund' });
  let seen = null;
  stubAxiosPost(async (url, payload) => {
    seen = payload;
    return { data: { is_anomaly: false, reason: 'not_anomaly' } };
  });
  try {
    const id = await insertExpense({ categoryId: cid, amount: 600 });
    await checkAnomaly(userId, 600, cid, id);
    assert.equal(seen.history.length, 10);
    assert.ok(!seen.history.includes(75000), 'income must not poison the spending history');
  } finally {
    restoreAxiosPost();
  }
});

// ── Direction handling (backend trusts the ML reason contract) ──────────────

test('ML anomaly for a LOW amount → suppressed via not_high_spending, no notification', async () => {
  const cid = await ensureCategory(userId, 'Travel-direction');
  await seedPreviousExpenses(10, { categoryId: cid, amount: 500 });
  const id = await insertExpense({ categoryId: cid, amount: 25 });
  stubAxiosPost(async () => ({ data: { is_anomaly: true, reason: 'not_high_spending', anomaly_score: -0.2 } }));
  try {
    const result = await checkAnomaly(userId, 25, cid, id);
    assert.deepEqual(result, { is_anomaly: false, reason: 'not_high_spending' });
    assert.equal(await countAnomalyNotifications(), 0);
  } finally {
    restoreAxiosPost();
  }
});

test('ML inlier slightly above the cluster → not_anomaly passes through, no notification', async () => {
  const cid = await ensureCategory(userId, 'Travel-direction2');
  await seedPreviousExpenses(10, { categoryId: cid, amount: 500 });
  const id = await insertExpense({ categoryId: cid, amount: 550 });
  stubAxiosPost(async () => ({ data: { is_anomaly: false, reason: 'not_anomaly', anomaly_score: 0.1 } }));
  try {
    const result = await checkAnomaly(userId, 550, cid, id);
    assert.deepEqual(result, { is_anomaly: false, reason: 'not_anomaly' });
    assert.equal(await countAnomalyNotifications(), 0);
  } finally {
    restoreAxiosPost();
  }
});

// ── End to end: notification linkage, dedup, degradation ────────────────────

test('anomaly_detected → expense created, notification linked via expense_id', async () => {
  const cid = await ensureCategory(userId, 'Travel-e2e');
  await seedPreviousExpenses(10, { categoryId: cid, amount: 500 });
  stubAxiosPost(async () => ({ data: { is_anomaly: true, reason: 'anomaly_detected', anomaly_score: 0.31 } }));
  try {
    const res = await addExpenseViaController({ category_id: cid, amount: 9000, title: 'Flight ticket' });
    assert.equal(res.statusCode, 200);
    assert.equal(res.payload.success, true);
    assert.equal(res.payload.is_anomaly, true);

    const [rows] = await pool.query(
      `SELECT id, expense_id, title, description, read_status FROM notifications
       WHERE user_id = ? AND type = 'anomaly' ORDER BY id DESC LIMIT 1`,
      [userId]
    );
    assert.equal(rows.length, 1);
    const notification = rows[0];
    assert.ok(notification.expense_id != null, 'notification must carry expense_id');
    const [expense] = await pool.query('SELECT id, amount FROM expenses WHERE id = ?', [notification.expense_id]);
    assert.equal(expense.length, 1);
    assert.equal(Number(expense[0].amount), 9000);
    assert.match(notification.description, /₹9000 in Travel-e2e/);
    assert.equal(Number(notification.read_status), 0);
  } finally {
    restoreAxiosPost();
  }
});

test('duplicate anomaly processing → only one notification for the expense', async () => {
  const [rows] = await pool.query(
    `SELECT expense_id FROM notifications WHERE user_id = ? AND type = 'anomaly' LIMIT 1`,
    [userId]
  );
  assert.equal(rows.length, 1);
  const before = await countAnomalyNotifications();
  const created = await createAnomalyNotificationOnce(userId, rows[0].expense_id, 'Unusual spending detected', 'duplicate attempt');
  assert.equal(created, false, 'existing alert must suppress a second one');
  assert.equal(await countAnomalyNotifications(), before);
});

test('ML unavailable → expense still created, no notification, graceful response', async () => {
  restoreAxiosPost(); // real axios; ML_SERVICE_URL is unset or unreachable locally
  const before = await countAnomalyNotifications();
  const cid = await ensureCategory(userId, 'Travel-e2e');
  const res = await addExpenseViaController({ category_id: cid, amount: 777, title: 'Fallback taxi' });
  assert.equal(res.statusCode, 200);
  assert.equal(res.payload.success, true);
  assert.equal(res.payload.is_anomaly, false);
  assert.equal(await countAnomalyNotifications(), before);
});

test('ML failure shapes (timeout/401/500/malformed) degrade to no anomaly', async () => {
  const cid = await ensureCategory(userId, 'Travel-degrade');
  await seedPreviousExpenses(10, { categoryId: cid, amount: 500 });
  const before = await countAnomalyNotifications();

  const failures = [
    Object.assign(new Error('timeout of 4000ms exceeded'), { code: 'ECONNABORTED' }),
    Object.assign(new Error('Request failed with status code 401'), { response: { status: 401 } }),
    Object.assign(new Error('Request failed with status code 500'), { response: { status: 500 } }),
  ];
  for (const failure of failures) {
    stubAxiosPost(async () => { throw failure; });
    const id = await insertExpense({ categoryId: cid, amount: 600 });
    const result = await checkAnomaly(userId, 600, cid, id);
    assert.equal(result.is_anomaly, false, `degrades on ${failure.message}`);
  }
  stubAxiosPost(async () => ({ data: 'unexpected payload shape' }));
  const id = await insertExpense({ categoryId: cid, amount: 600 });
  const result = await checkAnomaly(userId, 600, cid, id);
  assert.deepEqual(result, { is_anomaly: false, reason: 'not_anomaly' });

  restoreAxiosPost();
  assert.equal(await countAnomalyNotifications(), before, 'failures must not create alerts');
});

// ── Deletion behaviour ──────────────────────────────────────────────────────

test('delete expense WITH anomaly alert → notification removed (cascade + defensive cleanup)', async () => {
  const [rows] = await pool.query(
    `SELECT id, expense_id FROM notifications WHERE user_id = ? AND type = 'anomaly' LIMIT 1`,
    [userId]
  );
  assert.equal(rows.length, 1);
  const { id: notificationId, expense_id: expenseId } = rows[0];

  const res = await deleteExpenseViaController(expenseId);
  assert.equal(res.statusCode, 200);
  assert.equal(res.payload.success, true);

  const [notificationGone] = await pool.query('SELECT id FROM notifications WHERE id = ?', [notificationId]);
  assert.equal(notificationGone.length, 0, 'anomaly alert must disappear with its expense');
  const [expenseGone] = await pool.query('SELECT id FROM expenses WHERE id = ?', [expenseId]);
  assert.equal(expenseGone.length, 0);
});

test('delete expense WITHOUT anomaly alert → normal behaviour', async () => {
  const cid = await ensureCategory(userId, 'Travel-e2e');
  const before = await countAnomalyNotifications();
  const id = await insertExpense({ categoryId: cid, amount: 300 });
  const res = await deleteExpenseViaController(id);
  assert.equal(res.statusCode, 200);
  assert.equal(res.payload.success, true);
  const [expenseGone] = await pool.query('SELECT id FROM expenses WHERE id = ?', [id]);
  assert.equal(expenseGone.length, 0);
  assert.equal(await countAnomalyNotifications(), before);
});

// ── User isolation ──────────────────────────────────────────────────────────

test('user isolation: alerts, history and dashboard lists are scoped per user', async () => {
  const cidB = await ensureCategory(userBId, 'Travel');
  // The MIN_HISTORY gate is per-user AND per-category: user B needs their own
  // baseline of 10 before the backend even calls the ML service.
  await seedPreviousExpenses(10, { categoryId: cidB, userId: userBId });

  const listA = await getAnomalyHistory(userId);
  assert.ok(listA.every((n) => Number(n.user_id) === Number(userId)));

  stubAxiosPost(async () => ({ data: { is_anomaly: true, reason: 'anomaly_detected' } }));
  try {
    const resB = await addExpenseViaController(
      { category_id: cidB, amount: 9000, title: 'Flight B' },
      { id: userBId, email: USER_B_EMAIL }
    );
    assert.equal(resB.statusCode, 200);
    assert.equal(resB.payload.is_anomaly, true);

    const [bCount] = await pool.query(
      `SELECT COUNT(*) AS n FROM notifications WHERE user_id = ? AND type = 'anomaly'`,
      [userBId]
    );
    assert.equal(Number(bCount[0].n), 1, 'user B got their own alert');

    const listAAfter = await getAnomalyHistory(userId);
    const listB = await getAnomalyHistory(userBId);
    assert.ok(listB.length >= 1 && listB.every((n) => Number(n.user_id) === Number(userBId)));
    assert.ok(
      !listAAfter.some((n) => Number(n.user_id) !== Number(userId)),
      "user B's alert must never appear in user A's dashboard list"
    );
  } finally {
    restoreAxiosPost();
  }
});

// ── Legacy orphaned alerts + other notification types ───────────────────────

test('legacy orphaned anomaly rows (no expense_id / dangling id) are hidden from the dashboard', async () => {
  // Exactly what production looks like today for the stale ₹1 Travel alert:
  // a type='anomaly' row with no expense reference at all.
  const [legacy] = await pool.query(
    `INSERT INTO notifications (user_id, title, description, type, read_status)
     VALUES (?, 'Unusual spending detected', 'Your transaction of ₹1 in Travel is unusually high.', 'anomaly', FALSE)`,
    [userId]
  );
  let listed = await getAnomalyHistory(userId);
  assert.ok(!listed.some((n) => n.id === legacy.insertId), 'legacy orphan must not be listed');

  // A row pointing at an expense that was hard-deleted is equally invisible
  // (and the FK cascade actually removes it outright).
  const tempId = await insertExpense({ categoryId: await ensureCategory(userId, 'Travel-e2e'), amount: 50 });
  const [dangling] = await pool.query(
    `INSERT INTO notifications (user_id, title, description, type, read_status, expense_id)
     VALUES (?, 'Unusual spending detected', 'gone soon', 'anomaly', FALSE, ?)`,
    [userId, tempId]
  );
  await pool.query('DELETE FROM expenses WHERE id = ?', [tempId]);
  const [afterCascade] = await pool.query('SELECT id FROM notifications WHERE id = ?', [dangling.insertId]);
  assert.equal(afterCascade.length, 0, 'FK ON DELETE CASCADE removes the alert with the expense');
  listed = await getAnomalyHistory(userId);
  assert.ok(!listed.some((n) => n.id === dangling.insertId));

  await pool.query('DELETE FROM notifications WHERE id = ?', [legacy.insertId]);
});

test('budget/goal/recurring notifications are unaffected by any of this', async () => {
  const cid = await ensureCategory(userId, 'Travel-e2e');
  const [goalNotif] = await pool.query(
    `INSERT INTO notifications (user_id, title, description, type, read_status)
     VALUES (?, 'Goal behind schedule', 'keep me', 'goal_behind', FALSE)`,
    [userId]
  );
  const [recurringNotif] = await pool.query(
    `INSERT INTO notifications (user_id, title, description, type, read_status)
     VALUES (?, 'Recurring transaction created', 'keep me', 'recurring', FALSE)`,
    [userId]
  );

  const expenseId = await insertExpense({ categoryId: cid, amount: 100 });
  const res = await deleteExpenseViaController(expenseId);
  assert.equal(res.statusCode, 200);

  const [rows] = await pool.query(
    'SELECT id, expense_id FROM notifications WHERE id IN (?, ?)',
    [goalNotif.insertId, recurringNotif.insertId]
  );
  assert.equal(rows.length, 2, 'other notification types survive expense deletion');
  assert.ok(rows.every((r) => r.expense_id === null), 'they never carry an expense reference');

  const listed = await getAnomalyHistory(userId);
  assert.ok(!listed.some((n) => n.id === goalNotif.insertId || n.id === recurringNotif.insertId));

  await pool.query('DELETE FROM notifications WHERE id IN (?, ?)', [goalNotif.insertId, recurringNotif.insertId]);
});
