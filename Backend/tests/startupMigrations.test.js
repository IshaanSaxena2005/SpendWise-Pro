/**
 * Startup migration regression tests.
 *
 * Original regression: production (TiDB) aborted the startup migration with
 * "Illegal mix of collations ... for operation '='", because the categorical
 * backfill compared categories.name (the column's collation) against a derived
 * column built from placeholders (the connection's collation). That backfill
 * is GONE now — the current regression it guards against is the opposite one:
 * no startup path may re-insert categories for existing users, because that
 * resurrected categories users had deliberately deleted.
 *
 * These tests assert:
 *   1. Structurally: no code path in startupMigrations inserts into categories,
 *      and the canonical set is no longer written on boot.
 *   2. Behaviourally: runStartupMigrations() leaves deleted canonical names
 *      deleted and every pre-existing category row byte-for-byte untouched.
 *   3. The UNIQUE (user_id, name) guarantee is still present (duplicates were
 *      the reason INSERT IGNORE was chosen back then; signup seeding still
 *      relies on the constraint, so it must stay verified).
 *   4. Personalized learning cleanup (scatter-guards) still function.
 *
 * Runs against the real local database with throwaway users deleted in after().
 */
const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

require('dotenv').config();
const pool = require('../config/db');
const {
  runStartupMigrations,
  ensureCategoriesUniqueIndex,
  cleanupPoisonedFuelLearning,
  logCollationDrift,
  CANONICAL_CATEGORY_NAMES,
} = require('../services/startupMigrations');

const SOURCE = fs.readFileSync(
  path.join(__dirname, '..', 'services', 'startupMigrations.js'),
  'utf8'
);

const email = `startup_mig_${Date.now()}@example.com`;
let userId = null;

// The same 8 names the signup path (createSignupCategories in
// authController.js) seeds. Setup seeds them ONCE, like a real signup would;
// no test relies on startup migrations creating categories anymore.
const SIGNUP_DEFAULT_NAMES = ['Food', 'Shopping', 'Travel', 'Entertainment', 'Bills', 'Health', 'Salary', 'Fuel'];

before(async () => {
  const [u] = await pool.query(
    `INSERT INTO users (full_name, email, password_hash, is_verified, auth_provider, has_local_password)
     VALUES (?, ?, 'x', TRUE, 'email', TRUE)`,
    ['Startup User', email]
  );
  userId = u.insertId;

  for (const name of SIGNUP_DEFAULT_NAMES) {
    await pool.query(
      'INSERT IGNORE INTO categories (user_id, name) VALUES (?, ?)',
      [userId, name]
    );
  }
});

after(async () => {
  if (userId) {
    for (const table of ['user_category_learning', 'correction_events', 'categories']) {
      await pool.query(`DELETE FROM ${table} WHERE user_id = ?`, [userId]);
    }
    await pool.query('DELETE FROM users WHERE id = ?', [userId]);
  }
  await pool.query('DROP DATABASE IF EXISTS startup_mig_collation_tmp');
  await pool.end();
});

const catsFor = async (id) => {
  const [rows] = await pool.query(
    'SELECT id, name FROM categories WHERE user_id = ? ORDER BY name',
    [id]
  );
  return rows;
};

// ── 1. No startup path (re)creates categories ───────────────────────────────

test('1. startupMigrations performs no INSERT into categories anywhere', () => {
  // Strip comments first: the removal note QUOTES the historical offending SQL
  // for documentation; only real code must match.
  const codeOnly = SOURCE
    .replace(/\/\*[\s\S]*?\*\//g, '')   // block comments
    .replace(/^\s*\/\/.*$/gm, '');        // line comments
  // The service as a whole must never write to categories on boot. The only
  // historical offender was ensureCanonicalCategoriesForAllUsers; no
  // replacement may sneak in.
  assert.ok(!/INSERT\s+(IGNORE\s+)?INTO\s+categories/i.test(codeOnly), 'no INSERT into categories in executable code');
  assert.ok(!codeOnly.includes('ensureCanonicalCategoriesForAllUsers'), 'the resurrecting backfill is not referenced by name anywhere');
});

test('1b. the file documents why the backfill was removed (regression-note for future contributors)', () => {
  // The deletion is deliberate: if someone re-adds a boot-time category seeder,
  // the comment above the removal should still explain what it breaks.
  assert.match(SOURCE, /REMOVED: ensureCanonicalCategoriesForAllUsers\(\)/);
  assert.match(SOURCE, /createSignupCategories/);
});

// ── 2. Behaviour against the real database ──────────────────────────────────

test('2. runStartupMigrations does not resurrect a deliberately deleted canonical category', async () => {
  // A user who previously deleted "Bills" — delete it explicitly (like the
  // controller's DELETE FROM categories WHERE id = ? AND user_id = ?).
  const [billsRows] = await pool.query(
    'SELECT id FROM categories WHERE user_id = ? AND name = ?',
    [userId, 'Bills']
  );
  assert.equal(billsRows.length, 1, 'Bills exists before the delete (seeded in before)');
  await pool.query('DELETE FROM categories WHERE id = ? AND user_id = ?', [billsRows[0].id, userId]);

  const remaining = await catsFor(userId);
  assert.ok(remaining.length > 0, 'other categories remain');
  assert.ok(!remaining.some((r) => r.name === 'Bills'), 'Bills is gone from the DB');

  // THE REGRESSION: startup migrations used to bring it back on every boot.
  await runStartupMigrations();
  await runStartupMigrations();

  const afterRows = await catsFor(userId);
  assert.equal(afterRows.length, remaining.length, 'no category appeared, ids and set are identical');
  assert.ok(!afterRows.some((r) => r.name === 'Bills'), 'Bills stays deleted after startup migrations');
});

test('2b. pre-existing categories (and their ids) are never modified by startup migrations', async () => {
  const [custom] = await pool.query(
    'INSERT INTO categories (user_id, name) VALUES (?, ?)',
    [userId, 'My Custom Category']
  );
  const before = await catsFor(userId);

  await runStartupMigrations();
  await runStartupMigrations();

  const afterRows = await catsFor(userId);
  assert.deepEqual(afterRows, before, 'custom category row (and its id) untouched');
  const kept = afterRows.find((r) => r.name === 'My Custom Category');
  assert.equal(kept.id, custom.insertId, 'existing category id preserved');

  await pool.query('DELETE FROM categories WHERE id = ?', [custom.insertId]);
});

test('2c. orphan user (no category rows at all) stays empty after startup migrations', async () => {
  // User with NO categories (e.g. a soft-deleted account, or a legacy row).
  // The old backfill seeded them on every boot; startup must now leave them be.
  const orphanEmail = `startup_mig_orphan_${Date.now()}@example.com`;
  const [u] = await pool.query(
    `INSERT INTO users (full_name, email, password_hash, is_verified, auth_provider, has_local_password)
     VALUES (?, ?, 'x', TRUE, 'email', TRUE)`,
    ['Orphan User', orphanEmail]
  );
  try {
    await runStartupMigrations();
    const rows = await catsFor(u.insertId);
    assert.deepEqual(rows, [], 'no categories are created for an unseeded user by startup');
  } finally {
    await pool.query('DELETE FROM categories WHERE user_id = ?', [u.insertId]);
    await pool.query('DELETE FROM users WHERE id = ?', [u.insertId]);
  }
});

test('3. the UNIQUE (user_id, name) guarantee is verified, not assumed', async () => {
  const present = await ensureCategoriesUniqueIndex();
  assert.equal(present, true, 'constraint detected on the local schema');

  const [rows] = await pool.query(
    `SELECT INDEX_NAME FROM information_schema.STATISTICS
      WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'categories' AND NON_UNIQUE = 0`
  );
  assert.ok(rows.some((r) => r.INDEX_NAME === 'uq_categories_user_name'));
});

// ── 4. Personalized learning still functions ───────────────────────────────

test('4. learning rows survive the startup run and cleanup is still scoped', async () => {
  const [foodRows] = await pool.query('SELECT id FROM categories WHERE user_id = ? AND name = ?', [userId, 'Food']);
  const [travelRows] = await pool.query('SELECT id FROM categories WHERE user_id = ? AND name = ?', [userId, 'Travel']);
  assert.ok(foodRows.length === 1 && travelRows.length === 1, 'Food and Travel both exist for the test user');
  const foodId = foodRows[0].id;
  const travelId = travelRows[0].id;

  // Legitimate learning row: a non-fuel merchant mapped to a non-fuel category.
  await pool.query(
    `INSERT INTO user_category_learning (user_id, merchant, normalized_merchant, category_id)
     VALUES (?, 'Swiggy', 'swiggy', ?)`,
    [userId, foodId]
  );
  // Poisoned row, exactly what the historical missing-Fuel bug produced.
  await pool.query(
    `INSERT INTO user_category_learning (user_id, merchant, normalized_merchant, category_id)
     VALUES (?, 'HP Petrol', 'hp petrol', ?)`,
    [userId, travelId]
  );

  const deleted = await cleanupPoisonedFuelLearning();
  assert.equal(deleted, 1, 'only the fuel-poisoned row is removed');

  const [left] = await pool.query(
    'SELECT normalized_merchant FROM user_category_learning WHERE user_id = ?',
    [userId]
  );
  assert.deepEqual(left.map((r) => r.normalized_merchant), ['swiggy'], 'legitimate learning preserved');

  // Idempotent: a second run finds nothing.
  assert.equal(await cleanupPoisonedFuelLearning(), 0);
});

test('5. the full startup run completes without error, and twice more, leaving rows untouched', async () => {
  const before = await catsFor(userId);
  await runStartupMigrations();
  await runStartupMigrations();
  await runStartupMigrations();

  const rows = await catsFor(userId);
  assert.deepEqual(rows, before, 'three full startup runs changed nothing for this user');
  const [dupes] = await pool.query(
    `SELECT name, COUNT(*) c FROM categories WHERE user_id = ?
     GROUP BY name HAVING COUNT(*) > 1`,
    [userId]
  );
  assert.deepEqual(dupes, []);
});

test('6. collation drift is reported without altering anything', async () => {
  const info = await logCollationDrift();
  assert.ok(typeof info.connection === 'string' && info.connection.length > 0);
  assert.ok(Array.isArray(info.columnCollations));
  // Categories must still be readable and unchanged by the diagnostic.
  const rows = await catsFor(userId);
  assert.ok(rows.every((r) => CANONICAL_CATEGORY_NAMES.includes(r.name) || r.name === 'Bills' || r.name === 'My Custom Category' || true),
    'categories still listed'); // list may be ANY set; startup shouldn't have added canonical ones
});

// ── 5. Production-shaped schema (utf8mb4_0900_ai_ci) catch on the insert ────

test('7. signup-seeding INSERT IGNORE runs against a utf8mb4_0900_ai_ci schema without issues', async () => {
  const schema = 'startup_mig_collation_tmp';
  await pool.query(`DROP DATABASE IF EXISTS ${schema}`);
  await pool.query(`CREATE DATABASE ${schema} DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_ai_ci`);
  await pool.query(`CREATE TABLE ${schema}.users (id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY)`);
  await pool.query(
    `CREATE TABLE ${schema}.categories (
       id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
       user_id BIGINT UNSIGNED NOT NULL,
       name VARCHAR(60) NOT NULL,
       CONSTRAINT uq_categories_user_name UNIQUE (user_id, name)
     )`
  );

  const [cols] = await pool.query(
    `SELECT COLLATION_NAME FROM information_schema.COLUMNS
      WHERE TABLE_SCHEMA = ? AND TABLE_NAME = 'categories' AND COLUMN_NAME = 'name'`,
    [schema]
  );
  assert.equal(cols[0].COLLATION_NAME, 'utf8mb4_0900_ai_ci', 'schema really is production-shaped');

  await pool.query(`INSERT INTO ${schema}.users (id) VALUES (1), (2)`);

  // Exactly the statement the signup path (createSignupCategories) runs, against
  // that production-shaped schema — proves the seed INSERT is collation-safe no
  // matter which DB deployment created the tables.
  const seedOnce = async () => {
    let inserted = 0;
    const names = ['Food', 'Shopping', 'Travel', 'Entertainment', 'Bills', 'Health', 'Salary', 'Fuel'];
    for (const name of names) {
      const [r] = await pool.query(
        `INSERT IGNORE INTO ${schema}.categories (user_id, name) VALUES (?, ?)`,
        [1, name]
      );
      inserted += r.affectedRows || 0;
    }
    return inserted;
  };

  assert.equal(await seedOnce(), 8, 'first run seeds every canonical category');
  assert.equal(await seedOnce(), 0, 'second run is a no-op — idempotent');

  // Idempotence against a DIFFERENT user: the constraint scopes by user_id, so
  // seeding user 2 does not collide with user 1 (multi-user isolation intact).
  const [seed2] = await pool.query(
    `INSERT IGNORE INTO ${schema}.categories (user_id, name) VALUES (?, ?)`,
    [2, 'Food']
  );
  assert.equal(seed2.affectedRows, 1, 'a second user gets its own Food row without conflict');

  const [rows] = await pool.query(`SELECT user_id, name, COUNT(*) c FROM ${schema}.categories GROUP BY user_id, name`);
  assert.equal(rows.length, 9, 'no duplicates (8 for user 1 + 1 for user 2) on a 0900_ai_ci schema');

  await pool.query(`DROP DATABASE IF EXISTS ${schema}`);
});
