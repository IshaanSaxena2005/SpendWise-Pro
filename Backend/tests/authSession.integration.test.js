/**
 * Auth session persistence — integration tests (real database, real bcrypt,
 * real JWT), mirroring the throwaway-user style of categoryDeletion.test.js.
 *
 * THE tripwire: test "the users table exposes role for session restore"
 * fails with "Unknown column 'role'" in any environment whose schema is
 * behind the code — exactly the production drift that made /auth/me and
 * /auth/refresh 500 on every visit and forced a re-login each time the app
 * was opened. Run `node server.js` once in an environment to apply the
 * idempotent startup migrations before the suite, or run it after a deploy.
 *
 * Covers (end-to-end through the controllers + real persistence):
 *   1. login establishes the session (persistent cookies, hashed row).
 *   2. a valid refresh token renews the access token without rotation.
 *   3. an expired refresh token requires login (401, row deleted, cleared).
 *   4. logout revokes the session; subsequent refresh requires login.
 *   5. cross-user isolation: tokens resolve to their own owner only.
 *   6. schema.sql defines users.role for fresh installs (drift guard).
 */
const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');

require('dotenv').config();
const pool = require('../config/db');
const auth = require('../controllers/authController');

const runId = Date.now();
const emailA = `auth_it_A_${runId}@example.com`;
const emailB = `auth_it_B_${runId}@example.com`;
const PASSWORD = 'IntegrationPass1!';
let userAId = null;
let userBId = null;
let bcryptHash = null;

function response() {
  return {
    statusCode: 200,
    body: null,
    cookies: [],
    cleared: [],
    status(code) { this.statusCode = code; return this; },
    json(body) { this.body = body; return this; },
    cookie(name, value, options) { this.cookies.push({ name, value, options }); return this; },
    clearCookie(name, options) { this.cleared.push({ name, options }); return this; },
  };
}

const cookieOf = (res, name) => res.cookies.find((c) => c.name === name);

before(async () => {
  const bcrypt = require('bcrypt');
  bcryptHash = await bcrypt.hash(PASSWORD, 10);
  for (const [name, email] of [['Auth It A', emailA], ['Auth It B', emailB]]) {
    const [result] = await pool.query(
      `INSERT INTO users (full_name, email, password_hash, is_verified, auth_provider, has_local_password)
       VALUES (?, ?, ?, TRUE, 'email', TRUE)`,
      [name, email, bcryptHash]
    );
    if (email === emailA) userAId = result.insertId;
    else userBId = result.insertId;
  }
});

after(async () => {
  await pool.query('DELETE FROM refresh_tokens WHERE user_id IN (?, ?)', [userAId, userBId]);
  await pool.query('DELETE FROM users WHERE id IN (?, ?)', [userAId, userBId]);
  await pool.end();
});

test('the users table exposes role for session restore (schema-drift tripwire)', async () => {
  // This is the exact column list /auth/me selects. Pre-fix production threw
  // "Unknown column 'role' in 'field list'" here.
  await pool.query(
    'SELECT id, full_name, email, role, auth_provider, has_local_password, is_verified FROM users LIMIT 1'
  );
  const [rows] = await pool.query(
    "SHOW COLUMNS FROM users LIKE 'role'"
  );
  assert.equal(rows.length, 1, 'users.role must exist (added by server.js startup migration)');
});

test('schema.sql defines users.role so fresh installs cannot regress', () => {
  const schema = fs.readFileSync(path.resolve(__dirname, '..', 'schema', 'schema.sql'), 'utf8');
  const usersTable = schema.slice(schema.indexOf('CREATE TABLE users'), schema.indexOf('ENGINE=InnoDB', schema.indexOf('CREATE TABLE users')));
  assert.match(usersTable, /role\s+VARCHAR\(20\)\s+NOT NULL\s+DEFAULT\s+'Member'/i);
});

test('login establishes the session with persistent cookies and a hashed refresh row', async () => {
  const res = response();
  await auth.login({ body: { email: emailA, password: PASSWORD } }, res);

  assert.equal(res.statusCode, 200);
  const access = cookieOf(res, 'access_token');
  const refresh = cookieOf(res, 'refresh_token');
  assert.ok(access && refresh, 'both cookies issued');
  assert.equal(access.options.maxAge, 15 * 60 * 1000);
  assert.equal(refresh.options.maxAge, 30 * 24 * 60 * 60 * 1000, 'refresh cookie survives browser restarts');
  assert.equal(refresh.options.httpOnly, true);
  assert.equal(refresh.options.path, '/');

  const [rows] = await pool.query('SELECT token_hash FROM refresh_tokens WHERE user_id = ?', [userAId]);
  assert.equal(rows.length, 1);
  const expected = crypto.createHash('sha256').update(refresh.value).digest('hex');
  assert.equal(rows[0].token_hash, expected, 'DB stores only the hash');
  assert.ok(/^[a-f0-9]{80}$/.test(refresh.value));
});

test('a valid refresh token renews the access token and is not rotated', async () => {
  const loginRes = response();
  await auth.login({ body: { email: emailA, password: PASSWORD } }, loginRes);
  const raw = cookieOf(loginRes, 'refresh_token').value;
  const [before] = await pool.query('SELECT token_hash FROM refresh_tokens WHERE user_id = ?', [userAId]);

  const res = response();
  await auth.refresh({ cookies: { refresh_token: raw } }, res);

  assert.equal(res.statusCode, 200);
  assert.ok(cookieOf(res, 'access_token'), 'new access cookie issued');
  const [afterRows] = await pool.query('SELECT token_hash FROM refresh_tokens WHERE user_id = ?', [userAId]);
  assert.deepEqual(afterRows, before, 'no rotation → concurrent 401 bursts stay safe');

  // The renewed token is a working session: middleware accepts it and /me resolves user A.
  const jwt = require('jsonwebtoken');
  const payload = jwt.verify(cookieOf(res, 'access_token').value, process.env.JWT_SECRET);
  assert.equal(payload.id, userAId);
  const meRes = response();
  await auth.me({ user: payload }, meRes);
  assert.equal(meRes.statusCode, 200);
  assert.equal(meRes.body.user.email, emailA);
});

test('an expired refresh token requires login: 401, row deleted, cookies cleared', async () => {
  const loginRes = response();
  await auth.login({ body: { email: emailA, password: PASSWORD } }, loginRes);
  const raw = cookieOf(loginRes, 'refresh_token').value;
  await pool.query('UPDATE refresh_tokens SET expires_at = NOW() - INTERVAL 1 DAY WHERE user_id = ?', [userAId]);

  const res = response();
  await auth.refresh({ cookies: { refresh_token: raw } }, res);

  assert.equal(res.statusCode, 401);
  assert.deepEqual(res.cleared.map((c) => c.name).sort(), ['access_token', 'refresh_token']);
  const [rows] = await pool.query('SELECT id FROM refresh_tokens WHERE user_id = ?', [userAId]);
  assert.equal(rows.length, 0, 'expired row is purged');
});

test('logout revokes the session; a later refresh requires login', async () => {
  const loginRes = response();
  await auth.login({ body: { email: emailA, password: PASSWORD } }, loginRes);
  const raw = cookieOf(loginRes, 'refresh_token').value;

  const logoutRes = response();
  await auth.logout({ cookies: { refresh_token: raw } }, logoutRes);
  assert.equal(logoutRes.statusCode, 200);
  assert.deepEqual(logoutRes.cleared.map((c) => c.name).sort(), ['access_token', 'refresh_token']);

  const [rows] = await pool.query('SELECT id FROM refresh_tokens WHERE user_id = ?', [userAId]);
  assert.equal(rows.length, 0, 'logout deletes the stored session');

  const refreshRes = response();
  await auth.refresh({ cookies: { refresh_token: raw } }, refreshRes);
  assert.equal(refreshRes.statusCode, 401, 'revoked token cannot mint access');
});

test('cross-user isolation: user B’s token never resolves to user A', async () => {
  const loginA = response();
  await auth.login({ body: { email: emailA, password: PASSWORD } }, loginA);
  const rawA = cookieOf(loginA, 'refresh_token').value;

  const loginB = response();
  await auth.login({ body: { email: emailB, password: PASSWORD } }, loginB);
  const rawB = cookieOf(loginB, 'refresh_token').value;

  const jwt = require('jsonwebtoken');

  const refreshB = response();
  await auth.refresh({ cookies: { refresh_token: rawB } }, refreshB);
  assert.equal(refreshB.statusCode, 200);
  const payloadB = jwt.verify(cookieOf(refreshB, 'access_token').value, process.env.JWT_SECRET);
  assert.equal(payloadB.email, emailB);

  // B's login revoked only B's older token; A's session still works.
  const refreshA = response();
  await auth.refresh({ cookies: { refresh_token: rawA } }, refreshA);
  assert.equal(refreshA.statusCode, 200);
  const payloadA = jwt.verify(cookieOf(refreshA, 'access_token').value, process.env.JWT_SECRET);
  assert.equal(payloadA.email, emailA);
  assert.notEqual(payloadA.id, payloadB.id);
});
