/**
 * Production Database Diagnostic Script
 * 
 * Runs ALL diagnostic queries from the investigation checklist:
 * - Steps 1-7 from the debugging plan
 * 
 * Usage (local DB):
 *   node scripts/diagnose-production.js
 *
 * Usage (production DB via env override):
 *   DB_HOST=<tidb-host> DB_USER=<user> DB_PASSWORD=<pass> DB_NAME=<db> DB_PORT=4000 \
 *   node scripts/diagnose-production.js
 */

require('dotenv').config();
const pool = require('../config/db');

const DEMO_EMAIL = 'demo@spendwise.ai';

async function diagnose() {
  const conn = await pool.getConnection();
  try {
    console.log('═══════════════════════════════════════════════════════════');
    console.log('  SpendWise Pro — Production DB Diagnostic');
    console.log('═══════════════════════════════════════════════════════════\n');

    // Resolve the demo account on the target database. This script is read-only;
    // every following diagnostic query is scoped to this resolved user ID.
    const [demoUsers] = await conn.query(
      'SELECT id FROM users WHERE email = ? LIMIT 1',
      [DEMO_EMAIL]
    );
    if (demoUsers.length === 0) {
      throw new Error(`Demo user not found for email: ${DEMO_EMAIL}`);
    }
    const demoUserId = demoUsers[0].id;
    console.log(`Demo user ID: ${demoUserId}\n`);

    // ── STEP 2: DB timezone / date ──────────────────────────────────────
    console.log('── STEP 2: Database timezone / date ──────────────────────');
    const [[tz]] = await conn.query(
      `SELECT NOW() AS now_local, CURDATE() AS cur_date,
              UTC_TIMESTAMP() AS utc_ts, UTC_DATE() AS utc_d,
              @@global.time_zone AS global_tz, @@session.time_zone AS session_tz`
    );
    console.log('  NOW()           :', tz.now_local);
    console.log('  CURDATE()       :', tz.cur_date);
    console.log('  UTC_TIMESTAMP() :', tz.utc_ts);
    console.log('  UTC_DATE()      :', tz.utc_d);
    console.log('  global tz       :', tz.global_tz);
    console.log('  session tz      :', tz.session_tz);
    console.log();

    // ── STEP 5: Column types ────────────────────────────────────────────
    console.log('── STEP 5: expenses table column types ───────────────────');
    const [cols] = await conn.query(`SHOW COLUMNS FROM expenses`);
    cols.forEach(c => console.log(`  ${c.Field.padEnd(25)} ${c.Type.padEnd(30)} default=${c.Default ?? 'NULL'}`));
    console.log();

    // ── STEP 1a: Sample recent transactions ─────────────────────────────
    console.log(`── STEP 1a: 30 most recent transactions (user_id ${demoUserId}) ─────`);
    const [recent] = await conn.query(
      `SELECT id, user_id, amount, transaction_type, expense_date, created_at, note
       FROM expenses
       WHERE user_id = ?
       ORDER BY expense_date DESC, id DESC
       LIMIT 30`,
      [demoUserId]
    );
    if (recent.length === 0) {
      console.log('  ⚠️  NO TRANSACTIONS FOUND for user_id', demoUserId);
    } else {
      recent.forEach(r =>
        console.log(`  id=${r.id} | ${r.expense_date} | ${r.transaction_type.padEnd(7)} | ₹${r.amount} | ${r.note}`)
      );
    }
    console.log();

    // ── STEP 1b: Date range summary ──────────────────────────────────────
    console.log('── STEP 1b: Date range summary ───────────────────────────');
    const [[range]] = await conn.query(
      `SELECT MIN(expense_date) AS min_date, MAX(expense_date) AS max_date, COUNT(*) AS total
       FROM expenses WHERE user_id = ?`,
      [demoUserId]
    );
    console.log('  min_date :', range.min_date);
    console.log('  max_date :', range.max_date);
    console.log('  total    :', range.total);
    console.log();

    // ── STEP 1c: August 2026 explicit query ──────────────────────────────
    console.log('── STEP 1c: Explicit August 2026 rows ────────────────────');
    const [aug] = await conn.query(
      `SELECT expense_date, amount, transaction_type, note
       FROM expenses
       WHERE user_id = ?
         AND expense_date >= '2026-08-01'
         AND expense_date <  '2026-09-01'
       ORDER BY expense_date DESC`,
      [demoUserId]
    );
    console.log(`  Rows found: ${aug.length}`);
    aug.forEach(r =>
      console.log(`  ${r.expense_date} | ${r.transaction_type.padEnd(7)} | ₹${r.amount} | ${r.note}`)
    );
    console.log();

    // ── STEP 4: Current-month query (exact SQL from analyticsController) ──
    console.log('── STEP 4a: Current-month query (production SQL) ─────────');
    const [[cm]] = await conn.query(
      `SELECT
        COALESCE(SUM(CASE WHEN transaction_type='expense' THEN amount END), 0) AS spending,
        COUNT(CASE WHEN transaction_type='expense' THEN 1 END) AS expenses,
        COALESCE(SUM(CASE WHEN transaction_type='income' THEN amount END), 0) AS income
       FROM expenses
       WHERE user_id = ?
         AND expense_date >= DATE_FORMAT(CURDATE(), '%Y-%m-01')
         AND expense_date <  DATE_FORMAT(DATE_ADD(CURDATE(), INTERVAL 1 MONTH), '%Y-%m-01')`,
      [demoUserId]
    );
    console.log('  current_month_spending  :', cm.spending);
    console.log('  current_month_expenses  :', cm.expenses);
    console.log('  current_month_income    :', cm.income);
    console.log();

    // ── STEP 4b: Same query but explicit August dates ────────────────────
    console.log('── STEP 4b: Same query explicit 2026-08 ──────────────────');
    const [[cm2]] = await conn.query(
      `SELECT
        COALESCE(SUM(CASE WHEN transaction_type='expense' THEN amount END), 0) AS spending,
        COUNT(CASE WHEN transaction_type='expense' THEN 1 END) AS expenses,
        COALESCE(SUM(CASE WHEN transaction_type='income' THEN amount END), 0) AS income
       FROM expenses
       WHERE user_id = ?
         AND expense_date >= '2026-08-01'
         AND expense_date <  '2026-09-01'`,
      [demoUserId]
    );
    console.log('  spending  :', cm2.spending);
    console.log('  expenses  :', cm2.expenses);
    console.log('  income    :', cm2.income);
    console.log();

    // ── Months with data ─────────────────────────────────────────────────
    console.log('── Month distribution of all transactions ────────────────');
    const [months] = await conn.query(
      `SELECT DATE_FORMAT(expense_date, '%Y-%m') AS month,
              COUNT(*) AS tx_count,
              SUM(CASE WHEN transaction_type='expense' THEN amount ELSE 0 END) AS expense_total,
              SUM(CASE WHEN transaction_type='income'  THEN amount ELSE 0 END) AS income_total
       FROM expenses
       WHERE user_id = ?
       GROUP BY month
       ORDER BY month ASC`,
      [demoUserId]
    );
    months.forEach(m =>
      console.log(`  ${m.month}  txns=${m.tx_count}  expense=₹${m.expense_total}  income=₹${m.income_total}`)
    );
    console.log();

    // ── STEP 7: Budgets ──────────────────────────────────────────────────
    console.log(`── STEP 7: Budgets for user_id ${demoUserId} ───────────────────────`);
    const [budgets] = await conn.query(
      `SELECT id, category_id, month, amount_limit FROM budgets WHERE user_id = ? ORDER BY month DESC`,
      [demoUserId]
    );
    if (budgets.length === 0) {
      console.log('  ⚠️  NO BUDGETS FOUND');
    } else {
      budgets.forEach(b =>
        console.log(`  id=${b.id} | month=${b.month} | cat_id=${b.category_id ?? 'NULL(overall)'} | limit=₹${b.amount_limit}`)
      );
    }

    // Budget query for current month (production SQL)
    const [[bm]] = await conn.query(
      `SELECT amount_limit FROM budgets
       WHERE user_id = ? AND category_id IS NULL
         AND month = DATE_FORMAT(CURDATE(), '%Y-%m-01')
       LIMIT 1`,
      [demoUserId]
    );
    console.log('\n  Budget for CURDATE() current month:', bm ? `₹${bm.amount_limit}` : 'NULL (not found)');
    console.log();

    console.log('═══════════════════════════════════════════════════════════');
    console.log('  Diagnostic complete.');
    console.log('═══════════════════════════════════════════════════════════');

  } finally {
    conn.release();
    await pool.end();
  }
}

diagnose().catch(err => {
  console.error('❌ Diagnostic failed:', err);
  process.exit(1);
});
