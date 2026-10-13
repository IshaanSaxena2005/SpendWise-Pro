/**
 * Cron endpoint authentication — regression tests.
 *
 * Root cause being fixed: the inline checks
 *     req.headers['x-cron-secret'] !== process.env.CRON_SECRET
 * AUTHENTICATE ANONYMOUS REQUESTS when CRON_SECRET is unset (undefined ===
 * undefined), leaving /recurring/process-due (creates real expenses) and the
 * email cron endpoints open to anyone. The shared middleware now fails closed
 * (503 when unconfigured, 403 on mismatch) and compares in constant time.
 *
 * The routers are mounted in a throwaway Express app with their heavy service
 * dependencies stubbed, so no real processing/emails can happen here.
 */
const assert = require('node:assert/strict');
const test = require('node:test');
const path = require('node:path');

const dbPath = path.resolve(__dirname, '..', 'config', 'db.js');
const recurringServicePath = path.resolve(__dirname, '..', 'services', 'recurringExecutionService.js');
const emailServicePath = path.resolve(__dirname, '..', 'services', 'emailNotificationService.js');

process.env.JWT_SECRET = process.env.JWT_SECRET || 'cron-test-secret';

const serviceCalls = { processed: 0, monthly: 0, weekly: 0 };

function stubModules() {
  require.cache[dbPath] = { id: dbPath, filename: dbPath, loaded: true, exports: { query: async () => [[]] } };
  require.cache[recurringServicePath] = {
    id: recurringServicePath,
    filename: recurringServicePath,
    loaded: true,
    exports: {
      processDueRecurringTransactions: async () => { serviceCalls.processed += 1; return { processed: 0 }; },
      getRecurringSummary: async () => ({}),
      getRecurringExecutionHistory: async () => [],
      createRecurringSchedule: async () => ({ id: 1 }),
      advancePastExecutedOccurrences: async () => '2026-01-01',
      toIstDateString: (d) => String(d).split('T')[0],
    },
  };
  require.cache[emailServicePath] = {
    id: emailServicePath,
    filename: emailServicePath,
    loaded: true,
    exports: {
      sendMonthlyReportsToAllUsers: async () => { serviceCalls.monthly += 1; return { sent: 0 }; },
      sendWeeklyInsightsToAllUsers: async () => { serviceCalls.weekly += 1; return { sent: 0 }; },
    },
  };
}

stubModules();
const express = require('express');
const recurringRouter = require(path.resolve(__dirname, '..', 'routes', 'recurring.js'));
const emailRouter = require(path.resolve(__dirname, '..', 'routes', 'email.js'));

const app = express();
app.use(express.json());
app.use('/api/recurring', recurringRouter);
app.use('/api/email', emailRouter);

let server;
let base;

test.before(async () => {
  await new Promise((resolve) => { server = app.listen(0, resolve); });
  base = `http://127.0.0.1:${server.address().port}`;
});

test.after(() => { server.close(); });

const originalSecret = process.env.CRON_SECRET;

test('fail-closed: with CRON_SECRET unset every cron request is refused', async () => {
  delete process.env.CRON_SECRET;
  try {
    const a = await fetch(`${base}/api/recurring/process-due`, { method: 'POST' });
    assert.equal(a.status, 503, 'unconfigured cron must refuse, not authenticate');

    const b = await fetch(`${base}/api/email/cron/monthly-report`, { method: 'POST' });
    assert.equal(b.status, 503);

    // Even a header claiming to be a secret cannot authenticate without config.
    const c = await fetch(`${base}/api/recurring/process-due`, {
      method: 'POST',
      headers: { 'x-cron-secret': 'anything' },
    });
    assert.equal(c.status, 503);
    assert.equal(serviceCalls.processed, 0, 'scheduler service never ran');
    assert.equal(serviceCalls.monthly, 0, 'email service never ran');
  } finally {
    if (originalSecret !== undefined) process.env.CRON_SECRET = originalSecret;
  }
});

test('wrong secret is 403 and never reaches the services', async () => {
  process.env.CRON_SECRET = 'correct-horse-battery-staple';
  try {
    const a = await fetch(`${base}/api/recurring/process-due`, {
      method: 'POST',
      headers: { 'x-cron-secret': 'wrong' },
    });
    assert.equal(a.status, 403);

    const b = await fetch(`${base}/api/email/cron/weekly-insights`, {
      method: 'POST',
      headers: { 'x-cron-secret': '' },
    });
    assert.equal(b.status, 403);

    assert.equal(serviceCalls.processed, 0);
    assert.equal(serviceCalls.weekly, 0);
  } finally {
    if (originalSecret !== undefined) process.env.CRON_SECRET = originalSecret;
    else delete process.env.CRON_SECRET;
  }
});

test('correct secret authorizes the scheduler (services stubbed)', async () => {
  process.env.CRON_SECRET = 'correct-horse-battery-staple';
  try {
    const a = await fetch(`${base}/api/recurring/process-due`, {
      method: 'POST',
      headers: { 'x-cron-secret': 'correct-horse-battery-staple' },
    });
    assert.equal(a.status, 200);
    assert.equal(serviceCalls.processed, 1);

    const b = await fetch(`${base}/api/email/cron/monthly-report`, {
      method: 'POST',
      headers: { 'x-cron-secret': 'correct-horse-battery-staple' },
    });
    assert.equal(b.status, 200);
    assert.equal(serviceCalls.monthly, 1);
  } finally {
    if (originalSecret !== undefined) process.env.CRON_SECRET = originalSecret;
    else delete process.env.CRON_SECRET;
  }
});
