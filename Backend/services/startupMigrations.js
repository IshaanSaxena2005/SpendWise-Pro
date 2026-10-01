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

async function ensureCanonicalCategoriesForAllUsers() {
  // One row per canonical name: SELECT ... UNION ALL SELECT ...
  // INSERT IGNORE + UNIQUE(user_id, name) -> no duplicates, no updates, no deletes.
  const seeds = CANONICAL_CATEGORY_NAMES.map(() => 'SELECT ? AS name').join(' UNION ALL ');
  const [result] = await pool.query(
    `INSERT IGNORE INTO categories (user_id, name)
     SELECT u.id, s.name FROM users u
     CROSS JOIN (${seeds}) s
     WHERE NOT EXISTS (
       SELECT 1 FROM categories existing
       WHERE existing.user_id = u.id AND existing.name = s.name
     )`,
    [...CANONICAL_CATEGORY_NAMES]
  );
  const inserted = result ? result.affectedRows || 0 : 0;
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

async function runStartupMigrations() {
  // 1. Learning tables (migration 003) — verbatim schema from the migration file.
  await applyMigrationFile('003_create_user_category_learning.sql');
  // 2. Correction events (migration 007).
  await applyMigrationFile('007_create_correction_events.sql');
  // 3. Canonical categories (incl. Fuel) for every existing user, no duplicates.
  await ensureCanonicalCategoriesForAllUsers();
  // 4. One-time cleanup of learning rows poisoned by the historical bug.
  await cleanupPoisonedFuelLearning();
  // 5. Budget carry-forward claim table (idempotent; empty table is harmless).
  await applyMigrationFile('008_create_budget_carryforward_state.sql');
  // 6. Restore recurring rows whose is_active was NULLed by the edit bug.
  await healNullIsActiveRecurring();
  // 7. Ensure columns the recurring pipeline references exist (schema drift heal).
  await ensureRecurringSchemaColumns();
}

module.exports = {
  runStartupMigrations,
  ensureCanonicalCategoriesForAllUsers,
  cleanupPoisonedFuelLearning,
  healNullIsActiveRecurring,
  ensureRecurringSchemaColumns,
  CANONICAL_CATEGORY_NAMES,
  FUEL_KEYWORDS,
};
