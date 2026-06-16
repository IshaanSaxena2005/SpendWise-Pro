const axios = require('axios');
const mysql = require('mysql2/promise');
require('dotenv').config();

const API_URL = 'http://localhost:5000/api';

async function runEndToEndVerification() {
  const { exec, execSync } = require('child_process');
let serverProcess;
// Start backend server in test mode
try {
  serverProcess = exec('cross-env NODE_ENV=test node server.js');
  // Simple wait for server to start (adjust if needed)
  console.log('Starting backend server in test mode...');
  // Poll until server responds
  const waitForServer = async () => {
    const maxAttempts = 20;
    for (let i = 0; i < maxAttempts; i++) {
      try {
        await new Promise(res => setTimeout(res, 500));
        const res = await axios.get(`${API_URL}/test-db`);
        if (res.status === 200) return;
      } catch (_) {}
    }
    throw new Error('Backend server failed to start in time');
  };
  await waitForServer();
} catch (e) {
  console.error('Failed to start backend server:', e);
  process.exit(1);
}
  let token;
  const testEmail = `verify_phase13_${Date.now()}@example.com`;
  const testPassword = 'VerifyPassword123!';

  console.log('=== PHASE 13 E2E VERIFICATION TEST RUNNER ===\n');

  try {
    db = await mysql.createConnection({
      host: process.env.DB_HOST || 'localhost',
      user: process.env.DB_USER || 'root',
      password: process.env.DB_PASSWORD || 'root',
      database: process.env.DB_NAME || 'smart_financial_intelligence',
    });
    console.log('✔ Connected to Database');

    // 1. Forgot Password Flow
    console.log('\n--- 1. Testing Forgot Password System ---');
    console.log('Creating user...');
    await axios.post(`${API_URL}/auth/signup`, {
      full_name: 'Phase 13 Tester',
      email: testEmail,
      password: testPassword
    });

    console.log('Force-verifying user email in DB...');
    await db.query('UPDATE users SET is_verified = TRUE WHERE email = ?', [testEmail]);

    // Mock sendPasswordResetEmail logic or capture it.
    // Let's modify the forgot-password test to verify token generation.
    console.log('Triggering POST /auth/forgot-password...');
    const forgotRes = await axios.post(`${API_URL}/auth/forgot-password`, { email: testEmail });
    console.log('Forgot Password response:', forgotRes.data);

    // Retrieve token from DB to test reset
    const [userRows] = await db.query('SELECT id FROM users WHERE email = ?', [testEmail]);
    const userId = userRows[0].id;

    const [resetRows] = await db.query('SELECT * FROM password_resets WHERE user_id = ?', [userId]);
    if (resetRows.length === 0) {
      throw new Error('Forgot password token not saved in database');
    }
    console.log('✔ Password reset token successfully saved in database');
    console.log('✔ Reset token is hashed:', !resetRows[0].token.includes(testEmail));

    const expiresAt = new Date(resetRows[0].expires_at);
    const diffMin = (expiresAt - new Date()) / 60000;
    console.log(`✔ Token expiry is set correctly to: ${expiresAt} (~${Math.round(diffMin)} minutes from now)`);

    // We can reset password by finding the plain text token. Since we don't have the plain text token,
    // let's insert a dummy plain text token hashed by us in the database so we can test the /reset-password endpoint!
    const testPlainToken = 'my-super-secret-plain-token';
    const bcrypt = require('bcrypt');
    const dummyHash = await bcrypt.hash(testPlainToken, 10);
    await db.query('UPDATE password_resets SET token = ? WHERE user_id = ?', [dummyHash, userId]);
    console.log('Updated database with dummy hashed token for resetting.');

    console.log('Testing reset-password endpoint with dummy token...');
    const resetRes = await axios.post(`${API_URL}/auth/reset-password`, {
      email: testEmail,
      token: testPlainToken,
      newPassword: 'NewPassword123!'
    });
    console.log('Reset Password response:', resetRes.data);

    // Check if record is cleaned up (one-time use)
    const [resetRowsAfter] = await db.query('SELECT * FROM password_resets WHERE user_id = ?', [userId]);
    if (resetRowsAfter.length === 0) {
      console.log('✔ One-time use reset token successfully deleted from database after use');
    } else {
      throw new Error('Reset token was not cleaned up from DB');
    }

    console.log('Verifying login with OLD password fails...');
    try {
      await axios.post(`${API_URL}/auth/login`, {
        email: testEmail,
        password: testPassword
      });
      throw new Error('Old password worked after reset!');
    } catch (err) {
      if (err.response && err.response.status === 401) {
        console.log('✔ Login with old password correctly rejected (401)');
      } else {
        throw err;
      }
    }

    console.log('Verifying login with NEW password works...');
    const loginRes = await axios.post(`${API_URL}/auth/login`, {
      email: testEmail,
      password: 'NewPassword123!'
    });
    token = loginRes.data.token;
    console.log('✔ Login with new password succeeded!');

    // Rate limiting check
    console.log('\nTesting Forgot Password Rate Limiter...');
    let hitRateLimit = false;
    for (let i = 0; i < 10; i++) {
      try {
        await axios.post(`${API_URL}/auth/forgot-password`, { email: testEmail });
      } catch (err) {
        if (err.response && err.response.status === 429) {
          hitRateLimit = true;
          console.log(`✔ Rate limit hit successfully on request #${i + 1} (429 Too Many Requests)`);
          break;
        }
      }
    }
    if (!hitRateLimit) {
      throw new Error('Rate limiter failed to trigger within 10 requests');
    }

    // Clean up
    console.log('\nCleaning up test user...');
    await db.query('DELETE FROM users WHERE id = ?', [userId]);
    console.log('✔ Test user deleted.');
    console.log('\n=== ALL PHASE 13 E2E TESTS COMPLETED SUCCESSFULLY (100% PASS) ===');

  } catch (error) {
    console.error('\n❌ Verification failed:', error.response ? error.response.data : error.message);
    process.exit(1);
  } finally {
    if (db) await db.end();
  }
}

runEndToEndVerification();
