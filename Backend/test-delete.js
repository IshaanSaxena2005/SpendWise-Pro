const axios = require('axios');
const mysql = require('mysql2/promise');
require('dotenv').config();

const API_URL = 'http://localhost:5000/api';

async function runTest() {
  let db;
  let token;
  const testEmail = `test_delete_${Date.now()}@example.com`;
  const testPassword = 'Password123!';

  try {
    db = await mysql.createConnection({
      host: process.env.DB_HOST || 'localhost',
      user: process.env.DB_USER || 'root',
      password: process.env.DB_PASSWORD || 'root',
      database: process.env.DB_NAME || 'smart_financial_intelligence',
    });

    console.log('1. Creating test user...');
    await axios.post(`${API_URL}/auth/signup`, {
      full_name: 'Delete Test User',
      email: testEmail,
      password: testPassword
    });

    console.log('2. Forcing verification in DB to bypass email requirement...');
    await db.query('UPDATE users SET is_verified = TRUE WHERE email = ?', [testEmail]);

    console.log('3. Logging in...');
    const loginRes = await axios.post(`${API_URL}/auth/login`, {
      email: testEmail,
      password: testPassword
    });
    token = loginRes.data.token;

    console.log('4. Adding test category and expense directly to DB (simulating usage)...');
    const [userRows] = await db.query('SELECT id FROM users WHERE email = ?', [testEmail]);
    const userId = userRows[0].id;

    const [catRes] = await db.query('INSERT INTO categories (user_id, name) VALUES (?, ?)', [userId, 'Test Category']);
    const categoryId = catRes.insertId;

    await db.query('INSERT INTO expenses (user_id, category_id, amount, expense_date, note) VALUES (?, ?, ?, ?, ?)', 
      [userId, categoryId, 50.00, '2026-06-12', 'Test Expense']);

    await db.query('INSERT INTO budgets (user_id, category_id, month, amount_limit) VALUES (?, ?, ?, ?)', 
      [userId, categoryId, '2026-06-01', 100.00]);

    console.log('5. Testing delete with WRONG password...');
    try {
      await axios.delete(`${API_URL}/auth/delete-account`, {
        headers: { Authorization: `Bearer ${token}` },
        data: { password: 'WrongPassword!' }
      });
      console.error('FAIL: Expected 401 error for wrong password');
      process.exit(1);
    } catch (err) {
      if (err.response && err.response.status === 401) {
        console.log('   Correctly received 401 Unauthorized.');
      } else {
        throw err;
      }
    }

    console.log('6. Testing delete with CORRECT password...');
    const delRes = await axios.delete(`${API_URL}/auth/delete-account`, {
      headers: { Authorization: `Bearer ${token}` },
      data: { password: testPassword }
    });
    console.log('   Result:', delRes.data.message);

    console.log('7. Verifying DB cleanup...');
    const [users] = await db.query('SELECT * FROM users WHERE email = ?', [testEmail]);
    const [categories] = await db.query('SELECT * FROM categories WHERE user_id = ?', [userId]);
    const [expenses] = await db.query('SELECT * FROM expenses WHERE user_id = ?', [userId]);
    const [budgets] = await db.query('SELECT * FROM budgets WHERE user_id = ?', [userId]);

    console.log(`   Users remaining: ${users.length}`);
    console.log(`   Categories remaining: ${categories.length}`);
    console.log(`   Expenses remaining: ${expenses.length}`);
    console.log(`   Budgets remaining: ${budgets.length}`);

    if (users.length === 0 && categories.length === 0 && expenses.length === 0 && budgets.length === 0) {
      console.log('SUCCESS: All records completely wiped without orphans!');
    } else {
      console.error('FAIL: Orphan records detected!');
    }

    console.log('8. Testing re-registration with same email...');
    await axios.post(`${API_URL}/auth/signup`, {
      full_name: 'Recreated User',
      email: testEmail,
      password: testPassword
    });
    console.log('SUCCESS: Was able to re-register with the same email!');
    
    // Clean up second test user
    await db.query('DELETE FROM users WHERE email = ?', [testEmail]);
    
  } catch (error) {
    console.error('Test failed:', error.response ? error.response.data : error.message);
  } finally {
    if (db) await db.end();
  }
}

runTest();
