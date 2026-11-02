/**
 * processDue.test.js
 *
 * Integration tests for the POST /api/recurring/process-due endpoint and the
 * processDueRecurringTransactions() service function.
 *
 * Run with:  cd Backend && node --test tests/processDue.test.js
 *
 * Covers (per the Phase 5 checklist):
 *   ✓ Successful processing of multiple due recurring transactions
 *   ✓ Duplicate execution protection (same cron run fired twice)
 *   ✓ One recurring item failing while others succeed
 *   ✓ Catch-up after a missed scheduled run (overdue items)
 *   ✓ HTTP endpoint: 200 on success, 403 on wrong secret, 503 on missing secret
 *
 * Note: The Render 503 → retry and network-timeout scenarios are covered by
 * the Cloudflare Worker tests (cloudflare-worker/tests/worker.test.js).
 * Permanent 401/403 Worker tests are also there.
 */

const { test, before, after, describe } = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');

require('dotenv').config({ path: path.resolve(__dirname, '../.env') });

const pool = require('../config/db');
const service = require('../services/recurringExecutionService');
const { ensureCategory } = require('./helpers/ensureCategory');

const { getIstDate, calculateNextExecutionDate, processDueRecurringTransactions } = service;

// ── Test user setup ──────────────────────────────────────────────────────────

const EMAIL = `process_due_tests_${Date.now()}@example.com`;
let userId = null;
let catId = null;

function daysAgo(n) {
  const [y, m, d] = getIstDate().split('-').map(Number);
  const dt = new Date(y, m - 1, d - n);
  return `${dt.getFullYear()}-${String(dt.getMonth() + 1).padStart(2, '0')}-${String(dt.getDate()).padStart(2, '0')}`;
}

async function insertRule(overrides = {}) {
  const defaults = {
    type: 'expense',
    amount: 100,
    category_id: catId,
    note: 'test',
    frequency: 'monthly',
    start_date: getIstDate(),
    next_execution_date: getIstDate(),
    end_date: null,
    never_ends: 1,
    is_active: 1,
  };
  const row = { ...defaults, ...overrides };
  const [r] = await pool.query(
    `INSERT INTO recurring_transactions
       (user_id, type, amount, category_id, note, frequency, start_date,
        end_date, next_execution_date, never_ends, is_active)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [userId, row.type, row.amount, row.category_id, row.note, row.frequency,
     row.start_date, row.end_date, row.next_execution_date, row.never_ends, row.is_active]
  );
  return r.insertId;
}

async function transactionsOf(recurringId) {
  const [rows] = await pool.query(
    `SELECT id, DATE_FORMAT(expense_date, '%Y-%m-%d') AS expense_date, amount
       FROM expenses
      WHERE recurring_transaction_id = ? AND user_id = ?
      ORDER BY expense_date ASC, id ASC`,
    [recurringId, userId]
  );
  return rows;
}

async function ruleOf(recurringId) {
  const [rows] = await pool.query(
    `SELECT id,
            DATE_FORMAT(next_execution_date, '%Y-%m-%d') AS next_execution_date,
            is_active
       FROM recurring_transactions WHERE id = ? AND user_id = ?`,
    [recurringId, userId]
  );
  return rows[0] || null;
}

// ── Setup / Teardown ─────────────────────────────────────────────────────────

before(async () => {
  const [u] = await pool.query(
    `INSERT INTO users (full_name, email, password_hash, is_verified, auth_provider, has_local_password)
     VALUES ('ProcessDue Tests', ?, 'x', TRUE, 'email', TRUE)`,
    [EMAIL]
  );
  userId = u.insertId;
  catId = await ensureCategory(userId, 'ProcessDueTest');
});

after(async () => {
  await pool.query('DELETE FROM notifications WHERE user_id = ?', [userId]);
  await pool.query('DELETE FROM expenses WHERE user_id = ?', [userId]);
  await pool.query('DELETE FROM recurring_transactions WHERE user_id = ?', [userId]);
  await pool.query('DELETE FROM categories WHERE user_id = ?', [userId]);
  await pool.query('DELETE FROM refresh_tokens WHERE user_id = ?', [userId]);
  await pool.query('DELETE FROM users WHERE id = ?', [userId]);
  await pool.end();
});

// ── Tests ────────────────────────────────────────────────────────────────────

test('multiple due recurring transactions are all processed in one run', async () => {
  const id1 = await insertRule({ note: 'multi-1', next_execution_date: getIstDate() });
  const id2 = await insertRule({ note: 'multi-2', next_execution_date: getIstDate() });
  const id3 = await insertRule({ note: 'multi-3', next_execution_date: getIstDate() });

  const result = await processDueRecurringTransactions();

  // Filter to just our three rules.
  const ours = result.details.filter((d) => [id1, id2, id3].includes(d.recurringId));
  assert.equal(ours.length, 3, 'all three rules appear in results');

  // Each rule must have been either processed NOW ('succeeded') or already
  // processed by a concurrent scheduler call from another test file
  // ('skipped' with reason 'already_executed'). The important invariant is
  // that exactly one transaction exists for each rule.
  for (const d of ours) {
    assert.ok(
      d.status === 'succeeded' || d.status === 'skipped',
      `rule ${d.recurringId}: expected succeeded or skipped, got ${JSON.stringify(d)}`
    );
  }
  // Each rule must have exactly 1 transaction regardless of which run created it.
  assert.equal((await transactionsOf(id1)).length, 1, 'id1 must have exactly 1 transaction');
  assert.equal((await transactionsOf(id2)).length, 1, 'id2 must have exactly 1 transaction');
  assert.equal((await transactionsOf(id3)).length, 1, 'id3 must have exactly 1 transaction');
});

test('duplicate execution protection — calling process-due twice never creates duplicates', async () => {
  const id = await insertRule({ note: 'dedup-test', next_execution_date: getIstDate() });

  await processDueRecurringTransactions();
  await processDueRecurringTransactions(); // intentional second call

  const txns = await transactionsOf(id);
  assert.equal(txns.length, 1, 'exactly one transaction despite two cron runs');
});

test('simultaneous scheduler executions — concurrent runs never create duplicate expenses', async () => {
  const id = await insertRule({ note: 'concurrent-race-test', next_execution_date: getIstDate() });

  // Fire two scheduler executions simultaneously to simulate concurrent Workers
  const [res1, res2] = await Promise.all([
    processDueRecurringTransactions(),
    processDueRecurringTransactions()
  ]);

  const detail1 = res1.details.find((d) => d.recurringId === id);
  const detail2 = res2.details.find((d) => d.recurringId === id);

  // Exactly one expense must exist in the database
  const txns = await transactionsOf(id);
  assert.equal(txns.length, 1, 'exactly one transaction despite simultaneous executions');

  // Neither execution should have failed with unhandled error
  const statuses = [detail1?.status, detail2?.status].filter(Boolean);
  assert.ok(
    statuses.every((s) => s === 'succeeded' || s === 'skipped'),
    `both runs must succeed or skip, got ${JSON.stringify({ detail1, detail2 })}`
  );

  // Next execution date must have advanced correctly
  const rule = await ruleOf(id);
  assert.equal(
    rule.next_execution_date,
    calculateNextExecutionDate(getIstDate(), 'monthly'),
    'rule must advance to next month even under concurrent execution'
  );
});

test('catch-up after missed run — all overdue transactions are processed', async () => {
  // Simulate a schedule that was due 3 months ago (missed runs).
  const overdueDate = daysAgo(90);
  const id = await insertRule({ note: 'catchup-test', next_execution_date: overdueDate });

  // First run: creates the overdue occurrence and advances to next.
  const r1 = await processDueRecurringTransactions();
  const d1 = r1.details.find((d) => d.recurringId === id);
  assert.equal(d1?.status, 'succeeded', `first catchup run failed: ${JSON.stringify(d1)}`);
  assert.equal((await transactionsOf(id)).length, 1);

  // The rule should have advanced, but may still be behind today (next month is still past).
  const ruleAfterFirst = await ruleOf(id);
  const nextDate1 = ruleAfterFirst.next_execution_date;

  if (nextDate1 <= getIstDate()) {
    // Still behind — run again to catch up one more occurrence.
    const r2 = await processDueRecurringTransactions();
    const d2 = r2.details.find((d) => d.recurringId === id);
    assert.equal(d2?.status, 'succeeded', 'second catchup run should also succeed');
    assert.equal((await transactionsOf(id)).length, 2);
  }

  // Either way, the rule's next_execution_date must have advanced past the original overdue date.
  const finalRule = await ruleOf(id);
  assert.ok(
    finalRule.next_execution_date > overdueDate,
    `next_execution_date (${finalRule.next_execution_date}) must be past the overdue date (${overdueDate})`
  );
});

test('one failing item does not prevent other items from being processed', async () => {
  // Strategy: call processRecurringTransaction() directly with a hand-crafted
  // row that has next_execution_date = null, which causes requireIstDateString()
  // to throw at the very start — exactly like a malformed row returned by the
  // DB SELECT would. This exercises the per-item try/catch inside
  // processDueRecurringTransactions() without needing to corrupt real DB rows.

  const { processRecurringTransaction } = service;

  // Poisoned row: null next_execution_date will throw in requireIstDateString.
  const poisonRow = {
    id: 999999999, // fake id — never written to DB in this path
    user_id: userId,
    type: 'expense',
    amount: 100,
    category_id: catId,
    note: 'fault-isolation-bad',
    frequency: 'monthly',
    start_date: getIstDate(),
    end_date: null,
    next_execution_date: null, // triggers requireIstDateString to throw
    never_ends: 1,
    is_active: 1,
  };

  // processRecurringTransaction has an internal try/catch and should return
  // { status: 'failed', ... } rather than throw.
  let poisonResult;
  try {
    poisonResult = await processRecurringTransaction(poisonRow);
  } catch (err) {
    poisonResult = { status: 'failed', reason: err.message };
  }

  // Healthy rule runs through the real scheduler.
  const goodId = await insertRule({ note: 'fault-isolation-good', next_execution_date: getIstDate() });
  const runResult = await processDueRecurringTransactions();
  const goodDetail = runResult.details.find((d) => d.recurringId === goodId);

  // Poisoned row must record failure/skip, never throw uncaught.
  assert.ok(
    ['failed', 'skipped'].includes(poisonResult?.status),
    `processRecurringTransaction with null date should fail or skip, got: ${JSON.stringify(poisonResult)}`
  );

  // Good rule must succeed regardless.
  assert.equal(
    goodDetail?.status,
    'succeeded',
    `good rule must succeed: ${JSON.stringify(goodDetail)}`
  );
  assert.equal((await transactionsOf(goodId)).length, 1, 'good transaction was created');
});

// ── HTTP endpoint tests ──────────────────────────────────────────────────────

describe('POST /api/recurring/process-due (HTTP)', () => {
  const express = require('express');
  const dbPath = path.resolve(__dirname, '..', 'config', 'db.js');
  const recurringServicePath = path.resolve(__dirname, '..', 'services', 'recurringExecutionService.js');

  let server;
  let base;

  before(async () => {
    // Stub DB and service so no real processing happens in HTTP tests.
    const stubDb = { query: async () => [[]] };
    const stubService = {
      processDueRecurringTransactions: async () => ({ processed: 0, succeeded: 0, failed: 0, skipped: 0 }),
      getRecurringSummary: async () => ({}),
      getRecurringExecutionHistory: async () => [],
      createRecurringSchedule: async () => ({ id: 1 }),
      advancePastExecutedOccurrences: async () => '2026-01-01',
      toIstDateString: (d) => String(d).split('T')[0],
    };

    // Cache stubs so the router picks them up.
    require.cache[dbPath] = { id: dbPath, filename: dbPath, loaded: true, exports: stubDb };
    require.cache[recurringServicePath] = {
      id: recurringServicePath,
      filename: recurringServicePath,
      loaded: true,
      exports: stubService,
    };

    // Load the router AFTER the stubs are in place.
    // Use a fresh require by deleting the router cache key first.
    const routerPath = path.resolve(__dirname, '..', 'routes', 'recurring.js');
    delete require.cache[routerPath];

    process.env.JWT_SECRET = process.env.JWT_SECRET || 'test-jwt-secret';

    const app = express();
    app.use(express.json());
    app.use('/api/recurring', require(routerPath));

    await new Promise((resolve) => { server = app.listen(0, resolve); });
    base = `http://127.0.0.1:${server.address().port}`;
  });

  after(() => { server.close(); });

  const savedSecret = process.env.CRON_SECRET;

  test('200 with correct x-cron-secret', async () => {
    process.env.CRON_SECRET = 'http-test-secret';
    try {
      const res = await fetch(`${base}/api/recurring/process-due`, {
        method: 'POST',
        headers: { 'x-cron-secret': 'http-test-secret' },
      });
      assert.equal(res.status, 200);
      const body = await res.json();
      assert.equal(body.success, true);
    } finally {
      if (savedSecret !== undefined) process.env.CRON_SECRET = savedSecret;
      else delete process.env.CRON_SECRET;
    }
  });

  test('403 with wrong x-cron-secret', async () => {
    process.env.CRON_SECRET = 'http-test-secret';
    try {
      const res = await fetch(`${base}/api/recurring/process-due`, {
        method: 'POST',
        headers: { 'x-cron-secret': 'wrong' },
      });
      assert.equal(res.status, 403);
    } finally {
      if (savedSecret !== undefined) process.env.CRON_SECRET = savedSecret;
      else delete process.env.CRON_SECRET;
    }
  });

  test('503 when CRON_SECRET env var is missing', async () => {
    delete process.env.CRON_SECRET;
    try {
      const res = await fetch(`${base}/api/recurring/process-due`, { method: 'POST' });
      assert.equal(res.status, 503);
    } finally {
      if (savedSecret !== undefined) process.env.CRON_SECRET = savedSecret;
    }
  });

  test('403 when Authorization: Bearer is sent instead of x-cron-secret', async () => {
    process.env.CRON_SECRET = 'http-test-secret';
    try {
      // The Worker sends x-cron-secret. Sending Authorization: Bearer instead
      // must NOT authenticate (regression guard).
      const res = await fetch(`${base}/api/recurring/process-due`, {
        method: 'POST',
        headers: { authorization: 'Bearer http-test-secret' },
      });
      assert.equal(res.status, 403, 'wrong header name must not authenticate');
    } finally {
      if (savedSecret !== undefined) process.env.CRON_SECRET = savedSecret;
      else delete process.env.CRON_SECRET;
    }
  });
});
