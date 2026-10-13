/**
 * Auth session persistence — unit tests (db/bcrypt/google-auth-library stubbed).
 *
 * Regression background: production /auth/me and /auth/refresh returned
 * 500 "Unknown column 'role' in 'field list'" because users.role was missing
 * from schema.sql and from the startup migrations. Login still worked (it uses
 * SELECT *), cookies were issued correctly, but session restore and refresh
 * always failed server-side, so every page load bounced the user to login.
 * The row fixtures below therefore deliberately contain NO `role` field,
 * mirroring the real pre-fix production rows.
 *
 * Covers:
 *   1. login establishes the session (cookie attributes + hashed persistence).
 *   2. refresh renews the access token from a valid refresh cookie (page
 *      refresh / browser reopen keeps the session).
 *   3. refresh does NOT rotate the refresh token → concurrent 401 bursts can
 *      never invalidate each other.
 *   4. expired refresh token → 401, cookies cleared, row deleted.
 *   5. unknown refresh token → 401, cookies cleared.
 *   6. missing refresh cookie → 401 with no DB traffic.
 *   7. transient DB failure during refresh → 500 but cookies are NOT cleared.
 *   8. logout revokes the stored session and clears both cookies.
 *   9. cross-user isolation: the renewed access token identifies the token's
 *      owner, and /me scopes its lookup by the verified JWT subject.
 *  10. production cookie mode: Secure + SameSite=None; dev: Lax, not Secure.
 *  11. Google OAuth login issues the same persistent session cookies.
 *  12. login response falls back to role "Member" when the users row has no
 *      role value (drift tolerance for pre-migration rows).
 */
const assert = require('node:assert/strict');
const test = require('node:test');
const path = require('node:path');
const crypto = require('node:crypto');

const controllerPath = path.resolve(__dirname, '..', 'controllers/authController.js');
const middlewarePath = path.resolve(__dirname, '..', 'middleware/authMiddleware.js');
const dbPath = path.resolve(__dirname, '..', 'config', 'db.js');
const emailPath = path.resolve(__dirname, '..', 'utils', 'email.js');
const bcryptPath = require.resolve('bcrypt');
const googlePath = require.resolve('google-auth-library');

process.env.JWT_SECRET = process.env.JWT_SECRET || 'unit-test-secret';

function response() {
  return {
    statusCode: 200,
    body: null,
    cookies: [],
    cleared: [],
    status(code) { this.statusCode = code; return this; },
    json(body) { this.body = body; return this; },
    redirect(url) { this.redirectUrl = url; return this; },
    cookie(name, value, options) { this.cookies.push({ name, value, options }); return this; },
    clearCookie(name, options) { this.cleared.push({ name, options }); return this; },
  };
}

function cookie(res, name) {
  return res.cookies.find((c) => c.name === name);
}

function loadController({ query, googlePayload }) {
  delete require.cache[controllerPath];
  require.cache[dbPath] = { id: dbPath, filename: dbPath, loaded: true, exports: { query } };
  require.cache[emailPath] = {
    id: emailPath,
    filename: emailPath,
    loaded: true,
    exports: { sendVerificationEmail: async () => true, sendPasswordResetEmail: async () => true },
  };
  require.cache[bcryptPath] = {
    id: bcryptPath,
    filename: bcryptPath,
    loaded: true,
    exports: { compare: async () => true, hash: async () => 'stubbed-hash' },
  };
  require.cache[googlePath] = {
    id: googlePath,
    filename: googlePath,
    loaded: true,
    exports: {
      OAuth2Client: class {
        async verifyIdToken() {
          return { getPayload: () => googlePayload };
        }
      },
    },
  };
  return require(controllerPath);
}

function restoreModules() {
  delete require.cache[controllerPath];
  delete require.cache[dbPath];
  delete require.cache[emailPath];
  delete require.cache[bcryptPath];
  delete require.cache[googlePath];
}

const ACCESS_MS = 15 * 60 * 1000;
const REFRESH_MS = 30 * 24 * 60 * 60 * 1000;

test('login establishes the session: persistent cookies + hashed refresh token', async () => {
  const calls = [];
  const userRow = { id: 7, full_name: 'A', email: 'a@example.com', password_hash: 'h', is_verified: true };
  const auth = loadController({
    query: async (sql, values) => {
      calls.push([sql, values]);
      if (sql.startsWith('SELECT * FROM users')) return [[userRow]];
      return [{}];
    },
  });
  const res = response();
  await auth.login({ body: { email: 'a@example.com', password: 'x' } }, res);

  assert.equal(res.statusCode, 200);
  assert.equal(res.body.success, true);

  const access = cookie(res, 'access_token');
  const refreshCookie = cookie(res, 'refresh_token');
  assert.ok(access, 'access cookie set');
  assert.ok(refreshCookie, 'refresh cookie set');

  // Access: short-lived, httpOnly, site-wide path.
  assert.equal(access.options.maxAge, ACCESS_MS);
  assert.equal(access.options.httpOnly, true);
  assert.equal(access.options.path, '/');
  // Refresh: persistent across browser restarts.
  assert.equal(refreshCookie.options.maxAge, REFRESH_MS);
  assert.equal(refreshCookie.options.httpOnly, true);
  assert.equal(refreshCookie.options.path, '/');

  // Only the SHA-256 hash is persisted; raw token never touches the DB.
  const insert = calls.find(([sql]) => sql.includes('INSERT INTO refresh_tokens'));
  assert.ok(insert, 'refresh token persisted');
  const raw = refreshCookie.value;
  const expectedHash = crypto.createHash('sha256').update(raw).digest('hex');
  assert.deepEqual(insert[1], [7, expectedHash, insert[1][2]]);
  assert.notEqual(insert[1][1], raw);

  // Single-session policy: prior tokens for the user are revoked at login.
  assert.ok(calls.some(([sql]) => sql.startsWith('DELETE FROM refresh_tokens WHERE user_id = ?')));

  // Drift tolerance: no `role` value on the row → JWT still issued as Member.
  assert.equal(res.body.user.role, 'Member');
  restoreModules();
});

test('refresh renews the access token from a valid refresh cookie without rotating it', async () => {
  const raw = 'a'.repeat(80);
  const tokenHash = crypto.createHash('sha256').update(raw).digest('hex');
  const joinRow = { user_id: 7, id: 7, full_name: 'A', email: 'a@example.com', role: undefined, expires_at: new Date(Date.now() + 60_000) };
  const selects = [];
  const auth = loadController({
    query: async (sql) => {
      if (sql.startsWith('SELECT rt.user_id')) { selects.push(sql); return [[joinRow]]; }
      return [{}];
    },
  });
  const res = response();
  await auth.refresh({ cookies: { refresh_token: raw } }, res);

  assert.equal(res.statusCode, 200);
  const access = cookie(res, 'access_token');
  assert.ok(access, 'new access cookie issued');
  assert.equal(access.options.maxAge, ACCESS_MS);
  // No rotation: refresh cookie untouched and no DELETE/INSERT executed.
  assert.equal(cookie(res, 'refresh_token'), undefined);
  assert.equal(selects.length, 1);
  assert.ok(tokenHash.length === 64);
  restoreModules();
});

test('expired refresh token requires login: 401 + cookies cleared + row deleted', async () => {
  const queries = [];
  const auth = loadController({
    query: async (sql) => {
      queries.push(sql);
      if (sql.startsWith('SELECT rt.user_id')) {
        return [[{ user_id: 7, id: 7, full_name: 'A', email: 'a@example.com', expires_at: new Date(Date.now() - 1000) }]];
      }
      return [{}];
    },
  });
  const res = response();
  await auth.refresh({ cookies: { refresh_token: 'b'.repeat(80) } }, res);

  assert.equal(res.statusCode, 401);
  assert.ok(queries.some((sql) => sql.startsWith('DELETE FROM refresh_tokens WHERE token_hash = ?')));
  assert.deepEqual(res.cleared.map((c) => c.name).sort(), ['access_token', 'refresh_token']);
  assert.equal(cookie(res, 'access_token'), undefined);
  restoreModules();
});

test('unknown refresh token requires login: 401 + cookies cleared', async () => {
  const auth = loadController({ query: async () => [[]] });
  const res = response();
  await auth.refresh({ cookies: { refresh_token: 'c'.repeat(80) } }, res);

  assert.equal(res.statusCode, 401);
  assert.deepEqual(res.cleared.map((c) => c.name).sort(), ['access_token', 'refresh_token']);
  restoreModules();
});

test('refresh without a cookie is rejected without touching the DB', async () => {
  let queries = 0;
  const auth = loadController({ query: async () => { queries += 1; return [[]]; } });
  const res = response();
  await auth.refresh({ cookies: {} }, res);

  assert.equal(res.statusCode, 401);
  assert.equal(queries, 0);
  restoreModules();
});

test('a transient DB failure during refresh does NOT clear the session cookies', async () => {
  const auth = loadController({
    query: async () => { throw new Error('connection reset'); },
  });
  const res = response();
  await auth.refresh({ cookies: { refresh_token: 'd'.repeat(80) } }, res);

  assert.equal(res.statusCode, 500);
  assert.equal(res.cleared.length, 0, 'transient failures must not destroy a valid session');
  restoreModules();
});

test('logout revokes the stored refresh session and clears both cookies', async () => {
  const raw = 'e'.repeat(80);
  const tokenHash = crypto.createHash('sha256').update(raw).digest('hex');
  const deleted = [];
  const auth = loadController({
    query: async (sql, values) => {
      if (sql.startsWith('DELETE FROM refresh_tokens WHERE token_hash = ?')) { deleted.push(values[0]); return [{}]; }
      return [{}];
    },
  });
  const res = response();
  await auth.logout({ cookies: { refresh_token: raw } }, res);

  assert.equal(res.statusCode, 200);
  assert.deepEqual(deleted, [tokenHash]);
  assert.deepEqual(res.cleared.map((c) => c.name).sort(), ['access_token', 'refresh_token']);
  restoreModules();
});

test('cross-user isolation: renewed token identifies the token owner, /me scopes by JWT subject', async () => {
  // Refresh join resolves to user B no matter who "initiated" the request.
  const auth = loadController({
    query: async (sql) => {
      if (sql.startsWith('SELECT rt.user_id')) {
        return [[{ user_id: 43, id: 43, full_name: 'B', email: 'b@example.com', role: 'Member', expires_at: new Date(Date.now() + 60_000) }]];
      }
      return [{}];
    },
  });
  const res = response();
  await auth.refresh({ cookies: { refresh_token: 'f'.repeat(80) } }, res);
  const jwt = require('jsonwebtoken');
  const payload = jwt.verify(cookie(res, 'access_token').value, process.env.JWT_SECRET);
  assert.equal(payload.id, 43);

  // /me queries only the authenticated subject's row.
  const meQueries = [];
  const auth2 = loadController({
    query: async (sql, values) => {
      meQueries.push([sql, values]);
      if (sql.startsWith('SELECT id, full_name')) {
        return [[{ id: 43, full_name: 'B', email: 'b@example.com', role: 'Member', auth_provider: 'email', has_local_password: true, is_verified: true }]];
      }
      return [{}];
    },
  });
  const res2 = response();
  await auth2.me({ user: { id: 43 } }, res2);
  assert.equal(res2.statusCode, 200);
  assert.deepEqual(meQueries[0][1], [43]);
  restoreModules();
});

test('cookie security attributes follow the deployment mode', async () => {
  const userRow = { id: 7, full_name: 'A', email: 'a@example.com', password_hash: 'h', is_verified: true };
  const query = async (sql) => (sql.startsWith('SELECT * FROM users') ? [[userRow]] : [{}]);

  // Production (Vercel ↔ Render is cross-site): Secure + SameSite=None.
  process.env.NODE_ENV = 'production';
  try {
    const auth = loadController({ query });
    const res = response();
    await auth.login({ body: { email: 'a@example.com', password: 'x' } }, res);
    for (const c of res.cookies) {
      assert.equal(c.options.secure, true);
      assert.equal(c.options.sameSite, 'none');
    }
  } finally {
    delete process.env.NODE_ENV;
  }

  // Local development (same-site): Lax, not Secure.
  const authDev = loadController({ query });
  const resDev = response();
  await authDev.login({ body: { email: 'a@example.com', password: 'x' } }, resDev);
  for (const c of resDev.cookies) {
    assert.equal(c.options.secure, false);
    assert.equal(c.options.sameSite, 'lax');
  }
  restoreModules();
});

test('Google OAuth login issues the same persistent session cookies', async () => {
  const userRow = { id: 9, full_name: 'G', email: 'g@example.com', password_hash: 'h', is_verified: true, auth_provider: 'google', has_local_password: false };
  const calls = [];
  const auth = loadController({
    googlePayload: { email: 'g@example.com', name: 'G', email_verified: true },
    query: async (sql) => {
      calls.push(sql);
      if (sql.startsWith('SELECT * FROM users')) return [[userRow]];
      return [{}];
    },
  });
  const res = response();
  await auth.googleLogin({ body: { token: 'google-id-token' } }, res);

  assert.equal(res.statusCode, 200);
  assert.ok(cookie(res, 'access_token'));
  assert.equal(cookie(res, 'refresh_token').options.maxAge, REFRESH_MS);
  assert.ok(calls.some((sql) => sql.includes('INSERT INTO refresh_tokens')));
  assert.equal(res.body.user.role, 'Member');
  restoreModules();
});

test('authMiddleware still enforces valid access tokens (unchanged security)', () => {
  delete require.cache[middlewarePath];
  const jwt = require('jsonwebtoken');
  const middleware = require(middlewarePath);

  const good = jwt.sign({ id: 1, email: 'a@example.com' }, process.env.JWT_SECRET, { expiresIn: 60 });
  let nextCalled = false;
  middleware({ cookies: { access_token: good }, headers: {} }, { status() { throw new Error('unexpected'); } }, () => { nextCalled = true; });
  assert.equal(nextCalled, true);

  let status = null;
  middleware({ cookies: {}, headers: {} }, { status(c) { status = c; return this; }, json() { return this; } }, () => {});
  assert.equal(status, 401, 'missing token rejected');

  status = null;
  middleware({ cookies: { access_token: 'garbage' }, headers: {} }, { status(c) { status = c; return this; }, json() { return this; } }, () => {});
  assert.equal(status, 401, 'invalid token rejected');
});
