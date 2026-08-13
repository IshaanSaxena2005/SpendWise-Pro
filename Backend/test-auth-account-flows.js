const assert = require('node:assert/strict');
const test = require('node:test');
const path = require('node:path');

const controllerPath = path.resolve(__dirname, 'controllers/authController.js');
const notificationControllerPath = path.resolve(__dirname, 'controllers/notificationController.js');
const dbPath = path.resolve(__dirname, 'config/db.js');
const emailPath = path.resolve(__dirname, 'utils/email.js');

function response() {
  return {
    statusCode: 200,
    body: null,
    status(code) { this.statusCode = code; return this; },
    json(body) { this.body = body; return this; },
    redirect(url) { this.redirectUrl = url; return this; },
  };
}

function loadController({ query, sendVerificationEmail = async () => true }) {
  delete require.cache[controllerPath];
  require.cache[dbPath] = { id: dbPath, filename: dbPath, loaded: true, exports: { query } };
  require.cache[emailPath] = {
    id: emailPath,
    filename: emailPath,
    loaded: true,
    exports: { sendVerificationEmail, sendPasswordResetEmail: async () => true },
  };
  return require(controllerPath);
}

test('signup persists an unverified user and only reports success after the email send resolves', async () => {
  const calls = [];
  let sentEmail;
  const auth = loadController({
    query: async (sql, values) => {
      calls.push([sql, values]);
      if (sql.startsWith('SELECT id FROM users')) return [[]];
      if (sql.includes('INSERT INTO users')) return [{ insertId: 42 }];
      return [{}];
    },
    sendVerificationEmail: async (email, token) => { sentEmail = { email, token }; },
  });
  const res = response();
  await auth.signup({ body: { full_name: 'Test User', email: 'test@example.com', password: 'Password1' } }, res);

  assert.equal(res.statusCode, 201);
  assert.equal(res.body.requiresVerification, true);
  assert.equal(calls[1][1][3], false);
  assert.equal(sentEmail.email, 'test@example.com');
  assert.match(sentEmail.token, /^[a-f0-9]{64}$/);
});

test('signup does not fake success when the verification email fails', async () => {
  const auth = loadController({
    query: async (sql) => {
      if (sql.startsWith('SELECT id FROM users')) return [[]];
      if (sql.includes('INSERT INTO users')) return [{ insertId: 42 }];
      return [{}];
    },
    sendVerificationEmail: async () => { throw new Error('Brevo rejected recipient'); },
  });
  const res = response();
  await auth.signup({ body: { full_name: 'Test User', email: 'test@example.com', password: 'Password1' } }, res);

  assert.equal(res.statusCode, 502);
  assert.equal(res.body.errorType, 'verification_email_failed');
});

test('a Google-only account can set a local password without a current password', async () => {
  const writes = [];
  const auth = loadController({
    query: async (sql, values) => {
      if (sql.startsWith('SELECT password_hash')) return [[{ password_hash: 'random-oauth-hash', has_local_password: false }]];
      if (sql.startsWith('UPDATE users SET password_hash')) writes.push(values);
      return [{}];
    },
  });
  const res = response();
  await auth.updatePassword({ user: { id: 42, email: 'google@example.com' }, body: { newPassword: 'Password1' } }, res);

  assert.equal(res.statusCode, 200);
  assert.equal(res.body.hasLocalPassword, true);
  assert.equal(writes.length, 1);
  assert.notEqual(writes[0][0], 'Password1');
});

test('an existing local-password account rejects a password update without the current password', async () => {
  const auth = loadController({
    query: async (sql) => {
      if (sql.startsWith('SELECT password_hash')) return [[{ password_hash: 'unused', has_local_password: true }]];
      return [{}];
    },
  });
  const res = response();
  await auth.updatePassword({ user: { id: 42, email: 'local@example.com' }, body: { newPassword: 'Password1' } }, res);

  assert.equal(res.statusCode, 400);
  assert.equal(res.body.message, 'Current password is required.');
});

test('notification preferences return the persisted server response for Yes/No updates', async () => {
  const writes = [];
  delete require.cache[notificationControllerPath];
  require.cache[dbPath] = {
    id: dbPath,
    filename: dbPath,
    loaded: true,
    exports: {
      query: async (sql, values) => {
        if (sql.startsWith('INSERT INTO user_notification_preferences')) writes.push(values);
        return [{}];
      },
    },
  };
  const notifications = require(notificationControllerPath);
  const res = response();
  const preferences = { budgetAlerts: false, overspendingWarnings: true, aiForecasts: false, emailReports: true };
  await notifications.updatePreferences({ user: { id: 42 }, body: preferences }, res);

  assert.equal(res.statusCode, 200);
  assert.deepEqual(res.body.preferences, preferences);
  assert.deepEqual(writes[0], [42, false, true, false, true]);
});
