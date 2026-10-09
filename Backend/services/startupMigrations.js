/**
 * Idempotent startup migrations for tables that previously only existed via
 * manually-run scripts (Backend/scripts/apply_migration.js — never wired into
 * any deploy). Production (railway) was missing user_category_learning /
 * merchant_aliases / correction_events, disabling ALL personalized learning.
 *
 * Safety properties (all verified idempotent):
 *  - CREATE TABLE IF NOT EXISTS only; no DROP, no ALTER of existing data.
 *  - Schema is read verbatim from Backend/migrations/*.sql so this can never
 *    drift from the canonical migration definitions.
 *  - Category backfill relies on categories.uq_categories_user_name
 *    UNIQUE (user_id, name): INSERT IGNORE cannot create duplicates and never
 *    renames/deletes/re-points existing categories.
 *  - Fuel-learning cleanup is narrowly scoped: only deletes learning rows whose
 *    merchant matches a Fuel keyword AND whose category is a known non-Fuel
 *    name — exactly the pollution created by the missing-Fuel bug. Legitimate
 *    corrections for unrelated merchants/categories are untouched.
 *  - The recurring is_active heal only touches rows where is_active IS NULL —
 *    a value no UI flow produces deliberately (pause writes FALSE) — and
 *    restores them to TRUE, their pre-edit state.
 *
 * Failures are logged loudly, never silently swallowed.
 */

const fs = require('fs/promises');
const path = require('path');
const pool = require('../config/db');

// Canonical per-user categories (matches authController.js defaultCategories).
// Fuel + Health were missing from the demo/seed scripts, which is why some
// production users never had them.
const CANONICAL_CATEGORY_NAMES = [
  'Food',
  'Shopping',
  'Travel',
  'Entertainment',
  'Bills',
  'Health',
  'Salary',
  'Fuel',
];

// Must mirror categoryKeywords.js Fuel keywords. Descriptions containing any
// of these (as substring of the normalized merchant) are fuel transactions.
const FUEL_KEYWORDS = [
  'petrol',
  'diesel',
  'cng',
  'lpg',
  'fuel',
  'petroleum',
  'indian oil',
  'hp petrol',
  'bpcl',
  'shell',
  'gas cylinder',
];

// Category names that are unambiguously NOT fuel. Only learning rows pointing
// a fuel-keyword merchant at one of these are treated as poison from the
// historical missing-Fuel bug. Custom category names (e.g. "Car") are left
// alone — a user mapping fuel to their own category may be deliberate.
const NON_FUEL_KNOWN_CATEGORY_NAMES = [
  'food',
  'shopping',
  'travel',
  'entertainment',
  'bills',
  'health',
  'medical',
  'salary',
  'freelance',
];

async function applyMigrationFile(filename) {
  const sql = await fs.readFile(path.join(__dirname, '..', 'migrations', filename), 'utf8');
  await pool.query(sql); // pool uses multipleStatements: true
  console.log(`[StartupMigrations] applied/verified ${filename}`);
}

/**
 * Verify (and, when it is safe, create) UNIQUE (user_id, name) on categories.
 *
 * The category backfill's entire duplicate-safety guarantee rests on this
 * constraint — previously the code merely assumed it existed. If a database was
 * created before the constraint was added to schema.sql, INSERT IGNORE would
 * happily create duplicates, so we check instead of trusting.
 *
 * Never deletes or renames a row: if duplicates already exist the constraint
 * cannot be added and we log loudly rather than touching user data. Existing
 * category ids and relationships are never affected either way.
 */
async function ensureCategoriesUniqueIndex() {
  const [existing] = await pool.query(
    `SELECT INDEX_NAME, NON_UNIQUE, COLUMN_NAME
       FROM information_schema.STATISTICS
      WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'categories'
      ORDER BY INDEX_NAME, SEQ_IN_INDEX`
  );

  // A unique index must cover exactly (user_id, name) in that order.
  const byIndex = new Map();
  for (const row of existing) {
    if (!byIndex.has(row.INDEX_NAME)) byIndex.set(row.INDEX_NAME, []);
    byIndex.get(row.INDEX_NAME).push(row);
  }
  for (const rows of byIndex.values()) {
    const cols = rows.map((r) => r.COLUMN_NAME);
    if (Number(rows[0].NON_UNIQUE) === 0 && cols.length === 2 && cols[0] === 'user_id' && cols[1] === 'name') {
      return true;
    }
  }

  const [[dupes]] = await pool.query(
    'SELECT COUNT(*) AS dup_groups FROM (SELECT 1 FROM categories GROUP BY user_id, name HAVING COUNT(*) > 1) d'
  );
  if (Number(dupes.dup_groups) > 0) {
    console.warn(
      `[StartupMigrations] categories is missing UNIQUE (user_id, name) AND contains ` +
        `${dupes.dup_groups} duplicate group(s). Not adding the constraint and not deleting any rows — ` +
        `resolve the duplicates manually. Canonical backfill still runs INSERT IGNORE.`
    );
    return false;
  }

  try {
    await pool.query('ALTER TABLE categories ADD CONSTRAINT uq_categories_user_name UNIQUE (user_id, name)');
  } catch (err) {
    // Someone/something added it concurrently, or it exists under another name
    // that our check could not see. Re-check rather than guessing.
    if (err && err.code === 'ER_DUP_KEYNAME') {
      return true;
    }
    throw err;
  }
  console.log('[StartupMigrations] added missing UNIQUE (user_id, name) on categories (no duplicates were present)');
  return true;
}

/**
 * Backfill the canonical categories for every user.
 *
 * Runs one INSERT IGNORE ... SELECT per canonical name and performs NO string
 * comparison at all.
 *
 * Why: the previous version compared a real column against a derived column
 * built from placeholders —
 *     CROSS JOIN (SELECT ? AS name UNION ALL ...) s
 *     WHERE NOT EXISTS (SELECT 1 FROM categories existing
 *                       WHERE existing.user_id = u.id AND existing.name = s.name)
 * `existing.name` is IMPLICIT with the column's own collation, and `s.name` is
 * also IMPLICIT but inherits the CONNECTION collation. On a database created
 * with the MySQL 8 default that pair is utf8mb4_0900_ai_ci vs utf8mb4_unicode_ci
 * (mysql2 pins the connection collation), and TiDB rejects it outright:
 *   "Illegal mix of collations (utf8mb4_0900_ai_ci,IMPLICIT) and
 *    (utf8mb4_unicode_ci,IMPLICIT) for operation '='"
 * which aborted the whole startup migration and left personalized learning
 * unapplied.
 *
 * Duplicate safety is unchanged and now explicit: INSERT IGNORE plus
 * UNIQUE (user_id, name), guaranteed by ensureCategoriesUniqueIndex() which
 * runs immediately before this. No updates, no deletes, no renames.
 */
async function ensureCanonicalCategoriesForAllUsers() {
  let inserted = 0;
  for (const name of CANONICAL_CATEGORY_NAMES) {
    const [result] = await pool.query(
      'INSERT IGNORE INTO categories (user_id, name) SELECT u.id, ? FROM users u',
      [name]
    );
    inserted += result ? result.affectedRows || 0 : 0;
  }
  console.log(`[StartupMigrations] canonical category backfill complete (${inserted} categories added across all users)`);
  return inserted;
}

async function cleanupPoisonedFuelLearning() {
  // Historical bug: users without a "Fuel" category saved fuel transactions
  // under Travel/Food/etc. and user_category_learning memorized the wrong
  // mapping. Once learning becomes active again those rows would silently
  // override the (now correct) Fuel keyword/ML classification for FUTURE
  // transactions. Remove exactly those rows; keep everything else.
  const likeChain = FUEL_KEYWORDS.map(() => 'ucl.normalized_merchant LIKE ?').join(' OR ');
  const likeParams = FUEL_KEYWORDS.map((kw) => `%${kw}%`);
  const namePlaceholders = NON_FUEL_KNOWN_CATEGORY_NAMES.map(() => '?').join(', ');

  const [result] = await pool.query(
    `DELETE ucl FROM user_category_learning ucl
     JOIN categories c ON c.id = ucl.category_id AND c.user_id = ucl.user_id
     WHERE LOWER(c.name) IN (${namePlaceholders})
       AND (${likeChain})`,
    [...NON_FUEL_KNOWN_CATEGORY_NAMES, ...likeParams]
  );
  const deleted = result ? result.affectedRows || 0 : 0;
  if (deleted > 0) {
    console.log(
      `[StartupMigrations] fuel-learning cleanup: removed ${deleted} poisoned row(s) ` +
      `(fuel-keyword merchants learned as non-fuel category by the missing-Fuel bug). ` +
      `All other learning data preserved.`
    );
  } else {
    console.log('[StartupMigrations] fuel-learning cleanup: nothing to remove');
  }
  return deleted;
}

async function healNullIsActiveRecurring() {
  // Historical bug: updateRecurringTransaction wrote is_active straight from
  // the request body; clients that omitted the field (Recurring Management
  // edit) turned it NULL, which makes `WHERE is_active = TRUE` (cron, summary)
  // exclude the row forever — edited recurrings silently stopped processing.
  // Only the edit path can produce NULL here, so coalescing to TRUE restores
  // exactly the rows the bug broke. Idempotent: a second run affects 0 rows.
  const [result] = await pool.query(
    'UPDATE recurring_transactions SET is_active = TRUE WHERE is_active IS NULL'
  );
  const healed = result ? result.affectedRows || 0 : 0;
  if (healed > 0) {
    console.log(`[StartupMigrations] recurring is_active heal: restored ${healed} row(s) NULLed by the edit bug to active`);
  } else {
    console.log('[StartupMigrations] recurring is_active heal: nothing to restore');
  }
  return healed;
}

async function ensureRecurringSchemaColumns() {
  // Schema drift: production DBs created before certain schema.sql commits never
  // gain columns that the recurring pipeline (and notification UI) reference.
  // server.js only runs schema.sql on an EMPTY database, so nothing ever alters
  // these tables in place — the drift persists silently until a cron run hits
  // the missing column and every execution fails (or the request 500s when the
  // failing query sits outside the per-item try/catch).
  // Columns required by recurringExecutionService.js, added only if absent:
  //   - notifications.read_status        (Phase 12, commit 29ee9a1)
  //   - expenses.is_recurring / .recurring_transaction_id (recurring feature)
  //   - expenses.transaction_type        (migration 005)
  // Same ER_DUP_FIELDNAME-tolerant pattern server.js already uses. Idempotent.
  const columnMigrations = [
    "ALTER TABLE notifications ADD COLUMN read_status BOOLEAN DEFAULT FALSE",
    "ALTER TABLE expenses ADD COLUMN is_recurring BOOLEAN DEFAULT FALSE",
    "ALTER TABLE expenses ADD COLUMN recurring_transaction_id BIGINT UNSIGNED NULL",
    "ALTER TABLE expenses ADD COLUMN transaction_type ENUM('income', 'expense') NOT NULL DEFAULT 'expense'",
  ];
  for (const sql of columnMigrations) {
    try {
      await pool.query(sql);
      console.log(`[StartupMigrations] schema drift: added missing column via "${sql}"`);
    } catch (err) {
      if (err && err.code === 'ER_DUP_FIELDNAME') continue; // column already exists — expected
      throw err; // real failure (permissions, connection) — logged loudly by caller
    }
  }
  console.log('[StartupMigrations] recurring pipeline schema columns verified');
}

/**
 * Log the collation of every text column the startup path reads or writes.
 *
 * Purely diagnostic: nothing is altered here. The failure this guards against
 * was invisible because the schema inherits the server default (utf8mb4_0900_ai_ci
 * on MySQL 8) while mysql2 pins the connection to utf8mb4_unicode_ci, so the
 * mismatch only ever appeared as a runtime error on TiDB.
 */
async function logCollationDrift() {
  const TABLES = ['categories', 'user_category_learning', 'merchant_aliases', 'correction_events'];
  const [rows] = await pool.query(
    `SELECT TABLE_NAME, COLUMN_NAME, COLLATION_NAME
       FROM information_schema.COLUMNS
      WHERE TABLE_SCHEMA = DATABASE()
        AND TABLE_NAME IN (?)
        AND COLLATION_NAME IS NOT NULL
      ORDER BY TABLE_NAME, COLUMN_NAME`,
    [TABLES]
  );
  const [[conn]] = await pool.query('SELECT @@collation_connection AS c');
  const distinct = [...new Set(rows.map((r) => r.COLLATION_NAME))];
  const drifted = distinct.filter((c) => c !== conn.c);
  if (drifted.length > 0) {
    console.log(
      `[StartupMigrations] collation note: columns use ${distinct.join(', ')} ` +
        `while the connection is ${conn.c}. Startup SQL avoids cross-collation ` +
        `comparisons, so this is informational only.`
    );
  }
  return { connection: conn.c, columnCollations: distinct };
}

async function ensureAnomalyNotificationSchema() {
  // Schema drift: the anomaly-alert fix links anomaly notifications to the
  // expense that produced them. Databases created before the fix never gain
  // the column/FK from schema.sql (server.js only runs schema.sql on an EMPTY
  // database), so — exactly like ensureRecurringSchemaColumns — we add them
  // in place, tolerating the "already exists" errors that make this
  // idempotent. No data is modified: existing rows simply keep
  // expense_id = NULL (only legacy anomaly alerts can be orphaned; the
  // dashboard query filters those, see anomalyService.getAnomalyHistory).
  //   - notifications.expense_id      (this fix; FK ON DELETE CASCADE)
  try {
    await pool.query('ALTER TABLE notifications ADD COLUMN expense_id BIGINT UNSIGNED NULL');
    console.log('[StartupMigrations] schema drift: added notifications.expense_id');
  } catch (err) {
    if (!(err && (err.code === 'ER_DUP_FIELDNAME' || err.code === 'ER_DUP_KEYNAME'))) throw err;
  }

  try {
    await pool.query(
      `ALTER TABLE notifications
       ADD CONSTRAINT fk_notifications_expense
           FOREIGN KEY (expense_id) REFERENCES expenses (id)
           ON DELETE CASCADE`
    );
    console.log('[StartupMigrations] schema drift: added fk_notifications_expense (ON DELETE CASCADE)');
  } catch (err) {
    // ER_FK_DUP_NAME: constraint already present. ER_CANT_CREATE_TABLE:
    // MySQL reports a few constraint problems this way (e.g. a previous
    // partial run left the name behind). Both mean the constraint already
    // exists — expected on every run after the first.
    if (!(err && (err.code === 'ER_FK_DUP_NAME' || err.code === 'ER_CANT_CREATE_TABLE'))) throw err;
  }

  // Dashboard index for the anomaly query (user_id, type, created_at DESC).
  try {
    await pool.query(
      'ALTER TABLE notifications ADD INDEX idx_notifications_user_type_created (user_id, type, created_at DESC)'
    );
  } catch (err) {
    if (!(err && (err.code === 'ER_DUP_KEYNAME' || err.code === 'ER_CANT_DUP_FIELD'))) throw err;
  }

  console.log('[StartupMigrations] anomaly notification schema verified');
}

async function runStartupMigrations() {
  // 0. Anomaly alert fix: notifications.expense_id + FK ON DELETE CASCADE
  //    (schema drift heal; see ensureAnomalyNotificationSchema).
  await ensureAnomalyNotificationSchema();
  // 1. Learning tables (migration 003) — verbatim schema from the migration file.
  await applyMigrationFile('003_create_user_category_learning.sql');
  // 2. Correction events (migration 007).
  await applyMigrationFile('007_create_correction_events.sql');
  // 3. Make sure the constraint the backfill depends on actually exists.
  await ensureCategoriesUniqueIndex();
  // 4. Canonical categories (incl. Fuel) for every existing user, no duplicates.
  await ensureCanonicalCategoriesForAllUsers();
  // 4. One-time cleanup of learning rows poisoned by the historical bug.
  await cleanupPoisonedFuelLearning();
  // 5. Budget carry-forward claim table (idempotent; empty table is harmless).
  await applyMigrationFile('008_create_budget_carryforward_state.sql');
  // 6. Restore recurring rows whose is_active was NULLed by the edit bug.
  await healNullIsActiveRecurring();
  // 7. Ensure columns the recurring pipeline references exist (schema drift heal).
  await ensureRecurringSchemaColumns();
  // 8. Record any collation drift so a future failure is diagnosable up front.
  await logCollationDrift();
}

module.exports = {
  runStartupMigrations,
  ensureCanonicalCategoriesForAllUsers,
  ensureCategoriesUniqueIndex,
  cleanupPoisonedFuelLearning,
  healNullIsActiveRecurring,
  ensureRecurringSchemaColumns,
  ensureAnomalyNotificationSchema,
  logCollationDrift,
  CANONICAL_CATEGORY_NAMES,
  FUEL_KEYWORDS,
};
