/**
 * Database Verification Script for Demo Account
 * 
 * This script verifies that the production database contains the expected
 * demo data for user_id 39 (demo@spendwise.ai)
 * 
 * Usage: node scripts/verify-demo-data.js
 */

require('dotenv').config();
const pool = require('../config/db');

async function verifyDemoData() {
  try {
    console.log('🔍 Verifying demo account data in production database...\n');

    const DEMO_USER_ID = 39;

    // 1. Check total transaction count
    const [totalTxResult] = await pool.query(
      'SELECT COUNT(*) as total FROM expenses WHERE user_id = ?',
      [DEMO_USER_ID]
    );
    console.log(`📊 Total transactions for user_id ${DEMO_USER_ID}: ${totalTxResult[0].total}`);

    // 2. Check August 2026 transaction count
    const [augustTxResult] = await pool.query(
      `SELECT COUNT(*) as total, 
              SUM(CASE WHEN transaction_type = 'income' THEN amount ELSE 0 END) as income_total,
              SUM(CASE WHEN transaction_type = 'expense' THEN amount ELSE 0 END) as expense_total
       FROM expenses 
       WHERE user_id = ? 
       AND MONTH(expense_date) = 8 
       AND YEAR(expense_date) = 2026`,
      [DEMO_USER_ID]
    );
    console.log(`📅 August 2026 transactions: ${augustTxResult[0].total}`);
    console.log(`💰 August 2026 income total: ₹${augustTxResult[0].income_total || 0}`);
    console.log(`💸 August 2026 expense total: ₹${augustTxResult[0].expense_total || 0}`);

    // 3. Check current month transaction count (using CURDATE())
    const [currentMonthResult] = await pool.query(
      `SELECT COUNT(*) as total,
              SUM(CASE WHEN transaction_type = 'income' THEN amount ELSE 0 END) as income_total,
              SUM(CASE WHEN transaction_type = 'expense' THEN amount ELSE 0 END) as expense_total
       FROM expenses 
       WHERE user_id = ? 
       AND MONTH(expense_date) = MONTH(CURDATE())
       AND YEAR(expense_date) = YEAR(CURDATE())`,
      [DEMO_USER_ID]
    );
    console.log(`\n📅 Current month (CURDATE) transactions: ${currentMonthResult[0].total}`);
    console.log(`💰 Current month income total: ₹${currentMonthResult[0].income_total || 0}`);
    console.log(`💸 Current month expense total: ₹${currentMonthResult[0].expense_total || 0}`);

    // 4. Check database current date
    const [dateResult] = await pool.query('SELECT NOW(), CURDATE()');
    console.log(`\n🕐 Database NOW(): ${dateResult[0].NOW}`);
    console.log(`🕐 Database CURDATE(): ${dateResult[0].CURDATE}`);

    // 5. Check August 2026 category distribution
    const [categoryResult] = await pool.query(
      `SELECT c.name as category_name, 
              COUNT(*) as tx_count,
              SUM(e.amount) as total_amount
       FROM expenses e
       JOIN categories c ON c.id = e.category_id
       WHERE e.user_id = ? 
       AND MONTH(e.expense_date) = 8 
       AND YEAR(e.expense_date) = 2026
       GROUP BY c.id, c.name
       ORDER BY total_amount DESC`,
      [DEMO_USER_ID]
    );
    console.log(`\n📂 August 2026 category distribution:`);
    categoryResult.forEach(row => {
      console.log(`   ${row.category_name}: ${row.tx_count} transactions, ₹${row.total_amount}`);
    });

    // 6. Check August 2026 budgets
    const [budgetResult] = await pool.query(
      `SELECT b.id, 
              c.name as category_name,
              b.amount_limit,
              b.month
       FROM budgets b
       LEFT JOIN categories c ON c.id = b.category_id
       WHERE b.user_id = ? 
       AND MONTH(b.month) = 8 
       AND YEAR(b.month) = 2026
       ORDER BY b.category_id IS NULL, c.name`,
      [DEMO_USER_ID]
    );
    console.log(`\n🎯 August 2026 budgets: ${budgetResult.length} budgets`);
    budgetResult.forEach(row => {
      const categoryName = row.category_name || 'Overall';
      console.log(`   ${categoryName}: ₹${row.amount_limit} (${row.month})`);
    });

    // 7. Check all months with data
    const [monthsResult] = await pool.query(
      `SELECT DISTINCT 
              YEAR(expense_date) as year, 
              MONTH(expense_date) as month,
              COUNT(*) as tx_count
       FROM expenses 
       WHERE user_id = ?
       GROUP BY YEAR(expense_date), MONTH(expense_date)
       ORDER BY year DESC, month DESC`,
      [DEMO_USER_ID]
    );
    console.log(`\n📆 Months with transaction data:`);
    monthsResult.forEach(row => {
      console.log(`   ${row.year}-${String(row.month).padStart(2, '0')}: ${row.tx_count} transactions`);
    });

    // 8. Sample recent transactions
    const [recentResult] = await pool.query(
      `SELECT e.id, e.amount, e.expense_date, e.note, c.name as category_name, e.transaction_type
       FROM expenses e
       JOIN categories c ON c.id = e.category_id
       WHERE e.user_id = ?
       ORDER BY e.expense_date DESC
       LIMIT 5`,
      [DEMO_USER_ID]
    );
    console.log(`\n📝 Sample recent transactions:`);
    recentResult.forEach(row => {
      console.log(`   ${row.expense_date} | ${row.category_name} | ${row.transaction_type} | ₹${row.amount} | ${row.note || '(no note)'}`);
    });

    console.log('\n✅ Database verification complete\n');

  } catch (err) {
    console.error('❌ Error verifying demo data:', err);
    process.exit(1);
  } finally {
    await pool.end();
  }
}

verifyDemoData();
