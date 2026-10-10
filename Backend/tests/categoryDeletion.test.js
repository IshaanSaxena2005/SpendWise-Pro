/**
 * Category deletion regression tests (the "deleted category comes back" bug).
 *
 * Root cause (proven by live DB reproduction before the fix):
 * services/startupMigrations.js used to run, on EVERY server boot:
 *     INSERT IGNORE INTO categories (user_id, name) SELECT u.id, ? FROM users u
 * for all 8 canonical names. The DELETE endpoint itself was always correct —
 * the next boot resurrected the deleted name (under a NEW id).
 *
 * Fix: boot-time backfill removed. Default categories are seeded exactly once
 * per user, at signup (createSignupCategories in authController.js).
 *
 * Covers:
 *   A. A user can delete a canonical category (hard delete, real DB).
 *   B. runStartupMigrations() does NOT recreate it (THE regression).
 *   C. Other existing categories remain untouched.
 *   D. Signup-time seeding: a NEW user still receives default categories
 *      (via createSignupCategories, and via the module shape used by the
 *      email/Google signup paths).
 *   E. Other startup migrations still execute (schema heals verified).
 *   F. User isolation: delete and seeding are scoped by user_id; another
 *      user's categories are unaffected.
 *
 * Runs against the real local database. Every user/category/expense created
 * here is a throwaway, deleted again in after().
 */
const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');

require('dotenv').config();
const pool = require('../config/db');
const {
  runStartupMigrations,
} = require('../services/startupMigrations');
const {
  DEFAULT_CATEGORY_NAMES,
  createSignupCategories,
} = require('../controllers/authController');

const runId = Date.now();
const emailA = `cat_del_A_${runId}@example.com`;
const emailB = `cat_del_B_${runId}@example.com`;
let userAId = null;
let userBId = null;

before(async () => {
  const [a] = await pool.query(
    `INSERT INTO users (full_name, email, password_hash, is_verified, auth_provider, has_local_password)
     VALUES (?, ?, 'x', TRUE, 'email', TRUE)`,
    ['Category Delete A', emailA]
  );
  userAId = a.insertId;
  const [b] = await pool.query(
    `INSERT INTO users (full_name, email, password_hash, is_verified, auth_provider, has_local_password)
     VALUES (?, ?, 'x', TRUE, 'email', TRUE)`,
    ['Category Delete B', emailB]
  );
  userBId = b.insertId;

  // Both users start with the full default set, exactly as signup created them.
  await createSignupCategories(userAId);
  await createSignupCategories(userBId);
});

after(async () => {
  // FK RESTRICT on expenses.category_id: expenses must go first, then any
  // dependent tables, then categories, then the users.
  for (const [table, col] of [
    ['notifications', 'user_id'],
    ['expenses', 'user_id'],
    ['budgets', 'user_id'],
    ['user_category_learning', 'user_id'],
    ['categories', 'user_id'],
  ]) {
    try {
      await pool.query(`DELETE FROM ${table} WHERE ${col} IN (?, ?)`, [userAId, userBId]);
    } catch { /* table may not exist on every deployment shape */ }
  }
  await pool.query('DELETE FROM users WHERE id IN (?, ?)', [userAId, userBId]);
  await pool.end();
});

const catsFor = async (id) => {
  const [rows] = await pool.query(
    'SELECT id, name FROM categories WHERE user_id = ? ORDER BY name',
    [id]
  );
  return rows;
};

// ── A. Deletion itself works (canonical category, hard delete) ──────────────

test('A. a canonical category can be hard-deleted with the exact controller SQL', async () => {
  const [foodRows] = await pool.query(
    'SELECT id FROM categories WHERE user_id = ? AND name = ?',
    [userAId, 'Food']
  );
  assert.equal(foodRows.length, 1, 'Food exists for user A (as signup seeded it)');

  // The exact SQL of categoryController.deleteCategory.
  const [result] = await pool.query(
    'DELETE FROM categories WHERE id = ? AND user_id = ?',
    [foodRows[0].id, userAId]
  );
  assert.equal(result.affectedRows, 1, 'the DELETE touched exactly one row');

  const rows = await catsFor(userAId);
  assert.ok(!rows.some((r) => r.name === 'Food'), 'Food is gone immediately after the delete');
});

// ── B. THE regression: startup migrations do not resurrect the deletion ─────

test('B. running startup migrations does NOT recreate the deleted canonical category', async () => {
  // Pre-condition from test A: Food is gone for user A.
  const beforeRows = await catsFor(userAId);
  assert.ok(!beforeRows.some((r) => r.name === 'Food'), 'Food is still deleted at the start of B');

  await runStartupMigrations();
  await runStartupMigrations();
  await runStartupMigrations();

  const afterRows = await catsFor(userAId);
  assert.ok(!afterRows.some((r) => r.name === 'Food'), 'Bills/Food stay deleted after three full startup runs');

  // Stronger: the entire (id, name) set of user A is unchanged, byte-for-byte.
  assert.deepEqual(
    afterRows,
    beforeRows,
    'startup migrations neither added nor renamed any category for user A'
  );
});

// ── C. Other categories remain untouched ───────────────────────────────────

test('C. other existing categories (custom + canonical) keep their rows and ids', async () => {
  const [custom] = await pool.query(
    'INSERT INTO categories (user_id, name) VALUES (?, ?)',
    [userAId, 'Coffee Fund']
  );
  const [travelRows] = await pool.query(
    'SELECT id FROM categories WHERE user_id = ? AND name = ?',
    [userAId, 'Travel']
  );
  assert.equal(travelRows.length, 1, 'Travel exists for user A');
  const travelId = travelRows[0].id;
  const before = await catsFor(userAId);

  await runStartupMigrations();

  const afterRows = await catsFor(userAId);
  assert.deepEqual(afterRows, before, 'nothing was added, removed, or renamed');
  const keptCustom = afterRows.find((r) => r.name === 'Coffee Fund');
  const keptTravel = afterRows.find((r) => r.name === 'Travel');
  assert.equal(keptCustom.id, custom.insertId, 'custom category id preserved');
  assert.equal(keptTravel.id, travelId, 'canonical Travel row id preserved');

  await pool.query('DELETE FROM categories WHERE id = ?', [custom.insertId]);
});

// ── D. Signup-time seeding still gives new users their defaults ────────────

test('D1. DEFAULT_CATEGORY_NAMES matches the 8 signup defaults', () => {
  assert.deepEqual(
    [...DEFAULT_CATEGORY_NAMES].sort(),
    ['Bills', 'Entertainment', 'Food', 'Fuel', 'Health', 'Salary', 'Shopping', 'Travel']
  );
});

test('D2. createSignupCategories seeds all defaults for a brand-new user', async () => {
  const freshEmail = `cat_del_fresh_${runId}@example.com`;
  const [fresh] = await pool.query(
    `INSERT INTO users (full_name, email, password_hash, is_verified, auth_provider, has_local_password)
     VALUES (?, ?, 'x', TRUE, 'email', TRUE)`,
    ['Fresh Signup', freshEmail]
  );
  try {
    // This is EXACTLY what the /signup and /google controllers call.
    await createSignupCategories(fresh.insertId);
    const rows = await catsFor(fresh.insertId);
    assert.equal(rows.length, DEFAULT_CATEGORY_NAMES.length, 'all defaults created');
    for (const name of DEFAULT_CATEGORY_NAMES) {
      assert.ok(rows.some((r) => r.name === name), `${name} was created at signup`);
    }
  } finally {
    await pool.query('DELETE FROM categories WHERE user_id = ?', [fresh.insertId]);
    await pool.query('DELETE FROM users WHERE id = ?', [fresh.insertId]);
  }
});

test('D3. seeding is idempotent for the same user (Google re-login must not duplicate)', async () => {
  const countBefore = (await catsFor(userBId)).length;
  await createSignupCategories(userBId);
  await createSignupCategories(userBId);
  const afterRows = await catsFor(userBId);
  assert.equal(afterRows.length, countBefore, 're-running the signup seed adds nothing');
});

// ── E. Other startup migrations still execute correctly ────────────────────

test('E. startup run reports and preserves key schema invariants', async () => {
  // The UNIQUE (user_id, name) constraint is the load-bearing piece for the
  // signup-seed's INSERT IGNORE; the anomalies fix (notifications.expense_id +
  // FK ON DELETE CASCADE) must still be present after a full startup run.
  await runStartupMigrations();

  const [idx] = await pool.query(
    `SELECT INDEX_NAME FROM information_schema.STATISTICS
      WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'categories' AND NON_UNIQUE = 0`
  );
  assert.ok(idx.some((r) => r.INDEX_NAME === 'uq_categories_user_name'), 'UNIQUE (user_id, name) present');

  const [col] = await pool.query(
    `SELECT COLUMN_NAME, IS_NULLABLE FROM information_schema.COLUMNS
      WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'notifications' AND COLUMN_NAME = 'expense_id'`
  );
  assert.equal(col.length, 1, 'notifications.expense_id (anomaly fix) still ensured');

  const [fk] = await pool.query(
    `SELECT CONSTRAINT_NAME FROM information_schema.REFERENTIAL_CONSTRAINTS
      WHERE CONSTRAINT_SCHEMA = DATABASE() AND CONSTRAINT_NAME = 'fk_notifications_expense'`
  );
  assert.ok(fk.length === 1, 'fk_notifications_expense (ON DELETE CASCADE) still ensured');
});

// ── F. User isolation ──────────────────────────────────────────────────────

test('F1. deleting user A canonical category leaves user B completely untouched', async () => {
  // From test A, user A has Food deleted. Confirm user B never lost anything.
  const bRows = await catsFor(userBId);
  assert.equal(bRows.length, DEFAULT_CATEGORY_NAMES.length, 'user B still has every default category');
  for (const name of DEFAULT_CATEGORY_NAMES) {
    assert.ok(bRows.some((r) => r.name === name), `user B kept ${name}`);
  }
});

test('F2. startup migrations keep user isolation: no cross-user category leakage', async () => {
  const bBefore = await catsFor(userBId);

  await runStartupMigrations();

  const aRows = await catsFor(userAId);
  const bAfter = await catsFor(userBId);
  assert.deepEqual(bAfter, bBefore, 'user B rows identical after startup');
  // A's deleted Food must NOT have been restored via B's row or any global list.
  assert.ok(!aRows.some((r) => r.name === 'Food'), 'user A Food stays absent');
  // There is no global/shared category: every category belongs to exactly one user.
  const [orphans] = await pool.query(
    `SELECT c.id FROM categories c LEFT JOIN users u ON u.id = c.user_id WHERE u.id IS NULL`
  );
  assert.deepEqual(orphans, [], 'no category rows exist without an owning user');
});

test('F3. the resurrect-scenario is gone for a DIFFERENT canonical name too (Fuel)', async () => {
  const [fuelRows] = await pool.query(
    'SELECT id FROM categories WHERE user_id = ? AND name = ?',
    [userBId, 'Fuel']
  );
  assert.equal(fuelRows.length, 1, 'Fuel exists for user B');
  await pool.query('DELETE FROM categories WHERE id = ? AND user_id = ?', [fuelRows[0].id, userBId]);

  const before = await catsFor(userBId);
  await runStartupMigrations();
  const afterRows = await catsFor(userBId);
  assert.deepEqual(afterRows, before, 'Fuel stays deleted after a full startup run');

  // And the survived name is NOT hidden by a fresh id under the hood: total row
  // count per name is 1 (no "Bills + Bills(new id)" duplication possible).
  const [dupeNames] = await pool.query(
    `SELECT name, COUNT(*) c FROM categories WHERE user_id IN (?, ?) GROUP BY user_id, name HAVING COUNT(*) > 1`,
    [userAId, userBId]
  );
  assert.deepEqual(dupeNames, [], 'no duplicate (user_id, name) pairs for either test user');
});
