/**
 * Startup migration regression tests.
 *
 * Production (TiDB) aborted the whole startup migration with:
 *   "Illegal mix of collations (utf8mb4_0900_ai_ci,IMPLICIT) and
 *    (utf8mb4_unicode_ci,IMPLICIT) for operation '='"
 * because the canonical-category backfill compared categories.name (IMPLICIT,
 * the column's own collation) against a derived column built from placeholders
 * (IMPLICIT, the connection collation mysql2 pins to utf8mb4_unicode_ci).
 *
 * These tests assert:
 *   1. The backfill SQL performs no string comparison that can mix collations.
 *   2. Behaviour: idempotent, no duplicate categories, existing rows untouched,
 *      personalized learning / fuel cleanup still work.
 *   3. The backfill SQL actually runs against a utf8mb4_0900_ai_ci schema —
 *      the production shape — in a throwaway database.
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
  ensureCanonicalCategoriesForAllUsers,
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

before(async () => {
  const [u] = await pool.query(
    `INSERT INTO users (full_name, email, password_hash, is_verified, auth_provider, has_local_password)
     VALUES (?, ?, 'x', TRUE, 'email', TRUE)`,
    ['Startup User', email]
  );
  userId = u.insertId;
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

// ── 1. The offending comparison is gone ──────────────────────────────────────

test('1. the backfill performs no column-to-derived-column name comparison', () => {
  const body = SOURCE.slice(
    SOURCE.indexOf('async function ensureCanonicalCategoriesForAllUsers'),
    SOURCE.indexOf('async function cleanupPoisonedFuelLearning')
  );
  // A derived column from placeholders is what produced the IMPLICIT/IMPLICIT mix.
  assert.ok(!/CROSS JOIN \(\s*SELECT \? AS name/.test(body), 'no placeholder-derived seed table');
  assert.ok(!/existing\.name\s*=\s*s\.name/.test(body), 'no comparison against a derived column');
  assert.ok(!/=\s*s\.name/.test(body), 'no derived-column comparison at all');
  // The insert itself must still be IGNORE-guarded.
  assert.match(body, /INSERT IGNORE INTO categories/);
});

test('1b. no startup SQL compares two columns of different tables by name', () => {
  const cleanup = SOURCE.slice(
    SOURCE.indexOf('async function cleanupPoisonedFuelLearning'),
    SOURCE.indexOf('async function healNullIsActiveRecurring')
  );
  // Joins here are numeric (ids). The name test is a LOWER() against bound
  // constants, which both MySQL and TiDB coerce — assert it stays that way.
  assert.match(cleanup, /JOIN categories c ON c\.id = ucl\.category_id/);
  assert.doesNotMatch(cleanup, /JOIN\s+categories[^;]*ON[^;]*c\.name\s*=/i, 'no join on a text column');
});

// ── 2. Behaviour against the real database ───────────────────────────────────

test('2. backfill adds every canonical category exactly once', async () => {
  const inserted = await ensureCanonicalCategoriesForAllUsers();
  assert.equal(typeof inserted, 'number');

  const rows = await catsFor(userId);
  for (const name of CANONICAL_CATEGORY_NAMES) {
    assert.ok(rows.some((r) => r.name === name), `${name} was backfilled`);
  }
});

test('2b. re-running the backfill is idempotent (no duplicates, no updates)', async () => {
  const before = await catsFor(userId);

  // NOTE: the backfill legitimately seeds canonical categories for EVERY user,
  // and node --test runs files in parallel, so the total inserted count can be
  // non-zero when another test file creates a user in between. The invariant that
  // matters is that OUR rows never change and are never duplicated.
  await ensureCanonicalCategoriesForAllUsers();
  await ensureCanonicalCategoriesForAllUsers();

  const afterRows = await catsFor(userId);
  assert.deepEqual(afterRows, before, 'rows and their ids are completely unchanged');
  assert.equal(afterRows.length, CANONICAL_CATEGORY_NAMES.length, 'exactly one row per canonical name');

  const [dupes] = await pool.query(
    `SELECT name, COUNT(*) c FROM categories WHERE user_id = ?
     GROUP BY name HAVING COUNT(*) > 1`,
    [userId]
  );
  assert.deepEqual(dupes, [], 'no duplicate category names');

  // A zero-insert re-run is asserted against a frozen user set in test 7.
});

test('2c. existing user categories and their ids are never modified', async () => {
  const [custom] = await pool.query(
    'INSERT INTO categories (user_id, name) VALUES (?, ?)',
    [userId, 'My Custom Category']
  );
  const before = await catsFor(userId);

  await ensureCanonicalCategoriesForAllUsers();

  const afterRows = await catsFor(userId);
  assert.deepEqual(afterRows, before, 'custom category untouched');
  const kept = afterRows.find((r) => r.name === 'My Custom Category');
  assert.equal(kept.id, custom.insertId, 'existing category id preserved');

  await pool.query('DELETE FROM categories WHERE id = ?', [custom.insertId]);
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

// ── 4. Personalized learning still functions ────────────────────────────────

test('4. learning rows survive the startup run and cleanup is still scoped', async () => {
  const [foodRows] = await pool.query('SELECT id FROM categories WHERE user_id = ? AND name = ?', [userId, 'Food']);
  const [travelRows] = await pool.query('SELECT id FROM categories WHERE user_id = ? AND name = ?', [userId, 'Travel']);
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

test('5. the full startup run completes without error, and twice more', async () => {
  const before = await catsFor(userId);
  await runStartupMigrations();
  await runStartupMigrations();
  await runStartupMigrations();

  const rows = await catsFor(userId);
  assert.deepEqual(rows, before, 'three full startup runs changed nothing for this user');
  assert.equal(rows.length, CANONICAL_CATEGORY_NAMES.length, 'still exactly one row per canonical name');
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
  assert.equal(rows.length, CANONICAL_CATEGORY_NAMES.length);
});

// ── 5. Production-shaped schema (utf8mb4_0900_ai_ci) ────────────────────────

test('7. the new backfill SQL runs against a utf8mb4_0900_ai_ci schema', async () => {
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

  // Exactly the statement the service now runs, against that schema.
  const runOnce = async () => {
    let inserted = 0;
    for (const name of CANONICAL_CATEGORY_NAMES) {
      const [r] = await pool.query(
        `INSERT IGNORE INTO ${schema}.categories (user_id, name) SELECT u.id, ? FROM ${schema}.users u`,
        [name]
      );
      inserted += r.affectedRows || 0;
    }
    return inserted;
  };

  assert.equal(await runOnce(), CANONICAL_CATEGORY_NAMES.length * 2, 'first run seeds every user');
  assert.equal(await runOnce(), 0, 'second run is a no-op — idempotent');

  const [rows] = await pool.query(`SELECT user_id, name, COUNT(*) c FROM ${schema}.categories GROUP BY user_id, name`);
  assert.equal(rows.length, CANONICAL_CATEGORY_NAMES.length * 2, 'no duplicates on a 0900_ai_ci schema');

  await pool.query(`DROP DATABASE IF EXISTS ${schema}`);
});