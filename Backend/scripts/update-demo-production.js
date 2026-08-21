/**
 * SAFE DEMO ACCOUNT UPDATE SCRIPT FOR PRODUCTION
 * 
 * This script safely updates ONLY the demo account (demo@spendwise.ai)
 * with rolling demo data based on the current system date.
 * 
 * It will NOT affect any real user accounts.
 * 
 * Usage:
 *   CONFIRM_DEMO_SEED=true node scripts/update-demo-production.js
 */

require('dotenv').config();
const bcrypt = require('bcrypt');
const pool = require('../config/db');
const { DEMO_EMAIL } = require('../config/constants');

// Safety check
if (!process.env.CONFIRM_DEMO_SEED) {
  console.error('❌ SAFETY ERROR: This script requires CONFIRM_DEMO_SEED=true');
  console.error('This will DELETE and RECREATE all demo user data.');
  console.error('To proceed, run: CONFIRM_DEMO_SEED=true node scripts/update-demo-production.js');
  process.exit(1);
}

const DEMO_PASSWORD = 'SpendWiseDemo@2026';
const DEMO_NAME = 'Demo User';

// Categories to create
const CATEGORIES = [
  'Food',
  'Shopping',
  'Travel',
  'Entertainment',
  'Bills',
  'Medical',
  'Salary',
  'Freelance'
];

// Monthly transaction pattern (day of month, category, amount, note)
const MONTHLY_PATTERN = [
  { day: 1, category: 'Salary', amount: 60000, note: 'Monthly Salary' },
  { day: 2, category: 'Bills', amount: 18000, note: 'Rent' },
  { day: 3, category: 'Food', amount: 6500, note: 'Groceries for the month' },
  { day: 5, category: 'Food', amount: 2200, note: 'Fuel' },
  { day: 8, category: 'Food', amount: 1400, note: 'Food delivery' },
  { day: 12, category: 'Shopping', amount: 3200, note: 'Amazon shopping' },
  { day: 15, category: 'Bills', amount: 1600, note: 'Electricity bill' },
  { day: 18, category: 'Entertainment', amount: 900, note: 'Movie and entertainment' },
  { day: 22, category: 'Medical', amount: 1800, note: 'Medical expenses' },
  { day: 28, category: 'Shopping', amount: 4500, note: 'Investment/SIP' }
];

// Additional random transactions to add variety
const RANDOM_TRANSACTIONS = [
  { category: 'Food', amount: 500, note: 'Coffee and snacks' },
  { category: 'Food', amount: 1200, note: 'Lunch with colleagues' },
  { category: 'Shopping', amount: 2500, note: 'Clothing' },
  { category: 'Entertainment', amount: 800, note: 'Netflix subscription' },
  { category: 'Travel', amount: 4000, note: 'Weekend trip' },
  { category: 'Food', amount: 600, note: 'Dinner out' },
  { category: 'Shopping', amount: 1500, note: 'Books' },
  { category: 'Bills', amount: 1200, note: 'Internet bill' },
  { category: 'Medical', amount: 800, note: 'Pharmacy' },
  { category: 'Food', amount: 400, note: 'Breakfast' },
  { category: 'Entertainment', amount: 1500, note: 'Concert tickets' },
  { category: 'Travel', amount: 2500, note: 'Taxi fare' },
  { category: 'Shopping', amount: 3500, note: 'Electronics' },
  { category: 'Food', amount: 900, note: 'Groceries top-up' },
  { category: 'Bills', amount: 800, note: 'Mobile recharge' },
  { category: 'Medical', amount: 2000, note: 'Health checkup' },
  { category: 'Entertainment', amount: 600, note: 'Gaming subscription' },
  { category: 'Travel', amount: 6000, note: 'Flight tickets' }
];

// Specific transactions for current month to match exact totals
const CURRENT_MONTH_SPECIFIC_TRANSACTIONS = [
  { category: 'Food', amount: 500, note: 'Coffee' },
  { category: 'Food', amount: 500, note: 'Snacks' },
  { category: 'Food', amount: 500, note: 'Tea' },
  { category: 'Food', amount: 500, note: 'Juice' },
  { category: 'Food', amount: 500, note: 'Biscuits' },
  { category: 'Food', amount: 800, note: 'Lunch' },
  { category: 'Food', amount: 1000, note: 'Dinner' },
  { category: 'Food', amount: 800, note: 'Brunch' },
  { category: 'Food', amount: 600, note: 'Pizza' },
  { category: 'Food', amount: 600, note: 'Burger' },
  { category: 'Food', amount: 600, note: 'Sandwich' },
  { category: 'Food', amount: 400, note: 'Toast' },
  { category: 'Food', amount: 400, note: 'Eggs' },
  { category: 'Food', amount: 400, note: 'Fruits' },
  { category: 'Entertainment', amount: 900, note: 'Movies' },
  { category: 'Entertainment', amount: 900, note: 'Games' },
  { category: 'Shopping', amount: 1100, note: 'Groceries' },
  { category: 'Shopping', amount: 200, note: 'Stationery' },
  { category: 'Food', amount: 300, note: 'Ice cream' }
];

// Budget patterns (dynamic based on current date)
function generateBudgets(currentDate) {
  const budgets = [];
  const year = currentDate.getFullYear();
  const currentMonth = currentDate.getMonth();

  // Generate budgets for the last 3 months (current month + 2 previous)
  for (let i = 2; i >= 0; i--) {
    const budgetMonth = new Date(year, currentMonth - i, 1);
    const monthStr = budgetMonth.toISOString().split('T')[0];

    if (i === 0) {
      // Current month budgets
      budgets.push({ month: monthStr, category: null, amount: 55000 });
      budgets.push({ month: monthStr, category: 'Food', amount: 12500 });
      budgets.push({ month: monthStr, category: 'Shopping', amount: 8500 });
      budgets.push({ month: monthStr, category: 'Entertainment', amount: 4500 });
    } else if (i === 1) {
      // Previous month budgets
      budgets.push({ month: monthStr, category: null, amount: 55000 });
      budgets.push({ month: monthStr, category: 'Food', amount: 13000 });
      budgets.push({ month: monthStr, category: 'Shopping', amount: 9000 });
      budgets.push({ month: monthStr, category: 'Travel', amount: 5000 });
    } else {
      // Two months ago budgets
      budgets.push({ month: monthStr, category: null, amount: 50000 });
      budgets.push({ month: monthStr, category: 'Food', amount: 12000 });
      budgets.push({ month: monthStr, category: 'Shopping', amount: 8000 });
      budgets.push({ month: monthStr, category: 'Entertainment', amount: 4000 });
    }
  }

  return budgets;
}

// Recurring transactions for demo user
const RECURRING_TRANSACTIONS = [
  { type: 'income', amount: 60000, category: 'Salary', note: 'Monthly Salary', frequency: 'monthly', start_day: 1, never_ends: true },
  { type: 'expense', amount: 18000, category: 'Bills', note: 'Monthly Rent', frequency: 'monthly', start_day: 2, never_ends: true },
  { type: 'expense', amount: 1600, category: 'Bills', note: 'Electricity Bill', frequency: 'monthly', start_day: 15, never_ends: true },
  { type: 'expense', amount: 1200, category: 'Bills', note: 'Internet Bill', frequency: 'monthly', start_day: 5, never_ends: true },
  { type: 'expense', amount: 800, category: 'Bills', note: 'Mobile Recharge', frequency: 'monthly', start_day: 10, never_ends: true },
  { type: 'expense', amount: 4500, category: 'Shopping', note: 'Monthly Investment/SIP', frequency: 'monthly', start_day: 28, never_ends: true },
  { type: 'expense', amount: 800, category: 'Entertainment', note: 'Netflix Subscription', frequency: 'monthly', start_day: 20, never_ends: true },
  { type: 'expense', amount: 600, category: 'Entertainment', note: 'Gaming Subscription', frequency: 'monthly', start_day: 25, never_ends: true },
  { type: 'income', amount: 5000, category: 'Freelance', note: 'Freelance Income', frequency: 'weekly', start_day: 7, never_ends: true },
];

async function updateDemoUser() {
  try {
    console.log('🔄 Starting demo account update for production...');
    console.log(`📅 Current date: ${new Date().toISOString()}`);
    console.log(`👤 Demo email: ${DEMO_EMAIL}`);

    // Check if demo user exists
    const [existingUsers] = await pool.query(
      'SELECT id FROM users WHERE email = ?',
      [DEMO_EMAIL]
    );

    if (existingUsers.length === 0) {
      console.log('❌ Demo user not found. Cannot update non-existent account.');
      process.exit(1);
    }

    const userId = existingUsers[0].id;
    console.log(`✅ Found demo user with ID: ${userId}`);

    console.log('🗑️  Deleting existing demo data...');
    // Delete in correct order due to foreign key constraints
    await pool.query('DELETE FROM ai_insights WHERE user_id = ?', [userId]);
    await pool.query('DELETE FROM notifications WHERE user_id = ?', [userId]);
    await pool.query('DELETE FROM budgets WHERE user_id = ?', [userId]);
    await pool.query('DELETE FROM expenses WHERE user_id = ?', [userId]);
    await pool.query('DELETE FROM categories WHERE user_id = ?', [userId]);
    // Note: We do NOT delete the user itself, just their data
    console.log('✅ Existing demo data deleted');

    console.log('📝 Creating categories...');
    const categoryMap = {};
    for (const categoryName of CATEGORIES) {
      const [catResult] = await pool.query(
        'INSERT INTO categories (user_id, name) VALUES (?, ?)',
        [userId, categoryName]
      );
      categoryMap[categoryName] = catResult.insertId;
    }
    console.log(`✅ Created ${CATEGORIES.length} categories`);

    // Generate transactions for 6 months (current month + 5 previous)
    console.log('💰 Generating transactions...');
    const currentDate = new Date();
    const currentYear = currentDate.getFullYear();
    const currentMonth = currentDate.getMonth();

    const months = [];
    for (let i = 5; i >= 0; i--) {
      const monthDate = new Date(currentYear, currentMonth - i, 1);
      months.push({
        year: monthDate.getFullYear(),
        month: monthDate.getMonth(),
        isCurrentMonth: i === 0
      });
    }

    console.log(`📅 Generating data for months: ${months.map(m => `${m.year}-${String(m.month + 1).padStart(2, '0')}`).join(', ')}`);

    let transactionCount = 0;

    for (const { year, month, isCurrentMonth } of months) {
      // Add monthly pattern transactions
      for (const pattern of MONTHLY_PATTERN) {
        const transactionDate = new Date(year, month, pattern.day);
        const categoryId = categoryMap[pattern.category];

        // For current month, use exact amounts; for other months, add slight variation
        let amount;
        if (isCurrentMonth) {
          amount = pattern.amount;
        } else {
          const variation = 0.95 + Math.random() * 0.1;
          amount = Math.round(pattern.amount * variation);
        }

        await pool.query(
          'INSERT INTO expenses (user_id, category_id, amount, expense_date, note) VALUES (?, ?, ?, ?, ?)',
          [userId, categoryId, amount, transactionDate, pattern.note]
        );
        transactionCount++;
      }

      // Add some random transactions for variety
      let numRandom = 4 + Math.floor(Math.random() * 4); // 4-7 random transactions per month
      // For current month, use specific transactions to get exact totals
      if (isCurrentMonth) {
        for (const currentMonthTx of CURRENT_MONTH_SPECIFIC_TRANSACTIONS) {
          const randomDay = 1 + Math.floor(Math.random() * 28);
          const transactionDate = new Date(year, month, randomDay);
          const categoryId = categoryMap[currentMonthTx.category];

          await pool.query(
            'INSERT INTO expenses (user_id, category_id, amount, expense_date, note) VALUES (?, ?, ?, ?, ?)',
            [userId, categoryId, currentMonthTx.amount, transactionDate, currentMonthTx.note]
          );
          transactionCount++;
        }
      } else {
        for (let i = 0; i < numRandom; i++) {
          const randomTx = RANDOM_TRANSACTIONS[Math.floor(Math.random() * RANDOM_TRANSACTIONS.length)];
          const randomDay = 1 + Math.floor(Math.random() * 28);
          const transactionDate = new Date(year, month, randomDay);
          const categoryId = categoryMap[randomTx.category];

          // Add variation
          const variation = 0.9 + Math.random() * 0.2;
          const amount = Math.round(randomTx.amount * variation);

          await pool.query(
            'INSERT INTO expenses (user_id, category_id, amount, expense_date, note) VALUES (?, ?, ?, ?, ?)',
            [userId, categoryId, amount, transactionDate, randomTx.note]
          );
          transactionCount++;
        }
      }
    }

    console.log(`✅ Generated ${transactionCount} transactions over 6 months`);

    // Create budgets
    console.log('🎯 Creating budgets...');

    const budgets = generateBudgets(currentDate);
    for (const budget of budgets) {
      const categoryId = budget.category ? categoryMap[budget.category] : null;

      await pool.query(
        'INSERT INTO budgets (user_id, category_id, month, amount_limit) VALUES (?, ?, ?, ?)',
        [userId, categoryId, budget.month, budget.amount]
      );
    }

    console.log(`✅ Created ${budgets.length} budgets for recent months`);

    // Create recurring transactions
    console.log('🔄 Creating recurring transactions...');

    for (const recurring of RECURRING_TRANSACTIONS) {
      const categoryId = recurring.category ? categoryMap[recurring.category] : null;

      // Calculate start date (current month)
      const startDate = new Date(currentYear, currentMonth, recurring.start_day);

      // Calculate next execution date based on frequency
      let nextExecutionDate = new Date(startDate);
      switch (recurring.frequency) {
        case 'daily':
          nextExecutionDate.setDate(nextExecutionDate.getDate() + 1);
          break;
        case 'weekly':
          nextExecutionDate.setDate(nextExecutionDate.getDate() + 7);
          break;
        case 'monthly':
          nextExecutionDate.setMonth(nextExecutionDate.getMonth() + 1);
          break;
        case 'yearly':
          nextExecutionDate.setFullYear(nextExecutionDate.getFullYear() + 1);
          break;
      }

      await pool.query(
        `INSERT INTO recurring_transactions 
         (user_id, type, amount, category_id, note, frequency, start_date, next_execution_date, never_ends, is_active) 
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, TRUE)`,
        [
          userId,
          recurring.type,
          recurring.amount,
          categoryId,
          recurring.note,
          recurring.frequency,
          startDate.toISOString().split('T')[0],
          nextExecutionDate.toISOString().split('T')[0],
          recurring.never_ends
        ]
      );
    }

    console.log(`✅ Created ${RECURRING_TRANSACTIONS.length} recurring transactions`);

    console.log('✅ Demo account update completed successfully!');
    console.log(`🔐 Demo credentials: ${DEMO_EMAIL} / ${DEMO_PASSWORD}`);
    console.log('📊 Current month now contains realistic demo transactions.');
    process.exit(0);
  } catch (err) {
    console.error('❌ Error updating demo account:', err);
    process.exit(1);
  }
}

updateDemoUser();
