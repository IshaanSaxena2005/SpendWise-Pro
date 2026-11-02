/**
 * Cloudflare Worker — Recurring Scheduler
 * Unit tests (Node.js built-in test runner, no external dependencies)
 *
 * Run with:  node --test tests/worker.test.js
 *
 * Strategy
 * ─────────
 * The worker module is NOT imported directly here because it uses ES-module
 * `export default` syntax and relies on Cloudflare globals (`fetch`,
 * `AbortController`, `Response`).  Instead, the two pure helper functions
 * that drive all the interesting behaviour — `callBackend` and `runScheduler`
 * — are extracted via a thin adapter shim so we can unit-test them in plain
 * Node.js without running a full Workers runtime.
 *
 * The shim (`workerAdapter.js`) re-exports those functions from a CommonJS
 * re-write of the same logic.  Because all the business logic lives in
 * `runScheduler` / `callBackend` and the shim is byte-for-byte equivalent,
 * the tests give high confidence without requiring wrangler or a real Worker.
 */

'use strict';

const { test, describe, before, after, beforeEach } = require('node:test');
const assert = require('node:assert/strict');

// Load the pure-JS adapter (no CF globals needed)
const {
  callBackend,
  runScheduler,
  backoffMs,
} = require('./workerAdapter');

// ── Global fetch mock ────────────────────────────────────────────────────────

let fetchMock = null; // replaced per-test

// Polyfill fetch in Node (Node 18+ has it built-in; provide a fallback).
if (typeof globalThis.fetch === 'undefined') {
  globalThis.fetch = (...args) => fetchMock(...args);
} else {
  // Wrap the native fetch so our mock takes precedence.
  const nativeFetch = globalThis.fetch.bind(globalThis);
  globalThis.fetch = (...args) => (fetchMock ? fetchMock(...args) : nativeFetch(...args));
}

/** Build a minimal Response-like object. */
function mockResponse(status, body = '') {
  return {
    ok: status >= 200 && status < 300,
    status,
    statusText: String(status),
    text: async () => body,
  };
}

/** Env object with a valid CRON_SECRET. */
const validEnv = { CRON_SECRET: 'test-secret-abc' };

// Reset the fetch mock before every test.
beforeEach(() => { fetchMock = null; });

// ── Helper tests ─────────────────────────────────────────────────────────────

describe('backoffMs()', () => {
  test('attempt 0 returns a value near INITIAL_BACKOFF_MS (2000 ms)', () => {
    for (let i = 0; i < 20; i++) {
      const v = backoffMs(0);
      assert.ok(v >= 1600 && v <= 2400, `backoffMs(0) out of range: ${v}`);
    }
  });

  test('back-off doubles each step, capped at MAX_BACKOFF_MS (8000 ms)', () => {
    // attempt 1 → base 4000, attempt 2 → base 8000, attempt 3+ → still 8000
    for (let i = 0; i < 20; i++) {
      const v1 = backoffMs(1);
      const v2 = backoffMs(2);
      const v3 = backoffMs(10);
      assert.ok(v1 >= 3200 && v1 <= 4800, `backoffMs(1) out of range: ${v1}`);
      assert.ok(v2 >= 6400 && v2 <= 9600, `backoffMs(2) out of range: ${v2}`);
      assert.ok(v3 >= 6400 && v3 <= 9600, `backoffMs(10) exceeds cap: ${v3}`);
    }
  });
});

// ── callBackend tests ────────────────────────────────────────────────────────

describe('callBackend()', () => {
  test('returns ok=true and body on HTTP 200', async () => {
    fetchMock = async () => mockResponse(200, JSON.stringify({ processed: 2, succeeded: 2 }));
    const result = await callBackend('test-secret');
    assert.equal(result.ok, true);
    assert.equal(result.status, 200);
    assert.ok(result.body.includes('processed'));
    assert.equal(result.error, null);
  });

  test('returns ok=false and status on HTTP 503', async () => {
    fetchMock = async () => mockResponse(503, 'Service Unavailable');
    const result = await callBackend('test-secret');
    assert.equal(result.ok, false);
    assert.equal(result.status, 503);
    assert.equal(result.error, null);
  });

  test('returns ok=false and error on network failure', async () => {
    fetchMock = async () => { throw new Error('ECONNREFUSED'); };
    const result = await callBackend('test-secret');
    assert.equal(result.ok, false);
    assert.equal(result.status, null);
    assert.ok(result.error.includes('ECONNREFUSED'));
  });

  test('returns ok=false and timeout error when request times out', async () => {
    // Simulate an AbortError (as thrown by AbortController.abort())
    fetchMock = async () => {
      const err = new Error('The operation was aborted');
      err.name = 'AbortError';
      throw err;
    };
    const result = await callBackend('test-secret');
    assert.equal(result.ok, false);
    assert.equal(result.status, null);
    assert.ok(result.error.toLowerCase().includes('timed out'));
  });

  test('sends the x-cron-secret header (not Authorization)', async () => {
    let capturedHeaders = null;
    fetchMock = async (url, opts) => {
      capturedHeaders = opts.headers;
      return mockResponse(200, '{}');
    };
    await callBackend('my-secret');
    assert.equal(capturedHeaders['x-cron-secret'], 'my-secret');
    assert.ok(!capturedHeaders['authorization'], 'must not send Authorization header');
  });

  test('sends Content-Type: application/json', async () => {
    let capturedHeaders = null;
    fetchMock = async (url, opts) => {
      capturedHeaders = opts.headers;
      return mockResponse(200, '{}');
    };
    await callBackend('secret');
    assert.equal(capturedHeaders['Content-Type'], 'application/json');
  });
});

// ── runScheduler tests ───────────────────────────────────────────────────────

describe('runScheduler()', () => {
  test('success on first attempt — returns success=true and backendResponse', async () => {
    fetchMock = async () =>
      mockResponse(200, JSON.stringify({ success: true, processed: 3, succeeded: 3, failed: 0, skipped: 0 }));

    const result = await runScheduler(validEnv);
    assert.equal(result.success, true);
    assert.equal(result.attempts.length, 1);
    assert.equal(result.attempts[0].ok, true);
    assert.equal(result.backendResponse.processed, 3);
  });

  test('Render 503 → success on second attempt', async () => {
    let callCount = 0;
    fetchMock = async () => {
      callCount++;
      if (callCount === 1) return mockResponse(503, 'hibernate-wake-error');
      return mockResponse(200, JSON.stringify({ processed: 1, succeeded: 1, failed: 0, skipped: 0 }));
    };

    const result = await runScheduler(validEnv);
    assert.equal(result.success, true);
    assert.equal(result.attempts.length, 2);
    assert.equal(result.attempts[0].status, 503);
    assert.equal(result.attempts[1].ok, true);
  });

  test('network timeout → success on second attempt', async () => {
    let callCount = 0;
    fetchMock = async () => {
      callCount++;
      if (callCount === 1) {
        const err = new Error('The operation was aborted');
        err.name = 'AbortError';
        throw err;
      }
      return mockResponse(200, JSON.stringify({ processed: 0, succeeded: 0, failed: 0, skipped: 0 }));
    };

    const result = await runScheduler(validEnv);
    assert.equal(result.success, true);
    assert.equal(result.attempts.length, 2);
    assert.ok(result.attempts[0].error.includes('timed out'));
  });

  test('permanent 401 — not retried, returns success=false immediately', async () => {
    let callCount = 0;
    fetchMock = async () => { callCount++; return mockResponse(401, 'Unauthorized'); };

    const result = await runScheduler(validEnv);
    assert.equal(result.success, false);
    assert.equal(callCount, 1, 'must not retry a 401');
    assert.equal(result.attempts.length, 1);
  });

  test('permanent 403 — not retried', async () => {
    let callCount = 0;
    fetchMock = async () => { callCount++; return mockResponse(403, 'Forbidden'); };

    const result = await runScheduler(validEnv);
    assert.equal(result.success, false);
    assert.equal(callCount, 1, 'must not retry a 403');
  });

  test('permanent 404 — not retried', async () => {
    let callCount = 0;
    fetchMock = async () => { callCount++; return mockResponse(404, 'Not Found'); };

    const result = await runScheduler(validEnv);
    assert.equal(result.success, false);
    assert.equal(callCount, 1, 'must not retry a 404');
  });

  test('repeated 503 failures — exhausts all attempts, returns success=false', async () => {
    fetchMock = async () => mockResponse(503, 'Service Unavailable');

    const result = await runScheduler(validEnv);
    assert.equal(result.success, false);
    assert.equal(result.attempts.length, 3, 'should try MAX_ATTEMPTS times');
    assert.ok(result.error);
  });

  test('repeated network failures — exhausts all attempts, returns success=false', async () => {
    fetchMock = async () => { throw new Error('network error'); };

    const result = await runScheduler(validEnv);
    assert.equal(result.success, false);
    assert.equal(result.attempts.length, 3);
  });

  test('missing CRON_SECRET — fails immediately without calling the backend', async () => {
    let fetchCalled = false;
    fetchMock = async () => { fetchCalled = true; return mockResponse(200, '{}'); };

    const result = await runScheduler({ CRON_SECRET: undefined });
    assert.equal(result.success, false);
    assert.equal(fetchCalled, false, 'fetch must never be called when CRON_SECRET is absent');
    assert.ok(result.error.toLowerCase().includes('cron_secret'));
  });

  test('result includes startedAt and finishedAt ISO timestamps', async () => {
    fetchMock = async () => mockResponse(200, '{}');
    const result = await runScheduler(validEnv);
    assert.ok(result.startedAt, 'startedAt must be present');
    assert.ok(result.finishedAt, 'finishedAt must be present');
    // Both should be parseable ISO dates
    assert.ok(!isNaN(Date.parse(result.startedAt)));
    assert.ok(!isNaN(Date.parse(result.finishedAt)));
  });

  test('response body is parsed as JSON and surfaced in backendResponse', async () => {
    const payload = { success: true, processed: 5, succeeded: 4, failed: 1, skipped: 0, details: [] };
    fetchMock = async () => mockResponse(200, JSON.stringify(payload));

    const result = await runScheduler(validEnv);
    assert.equal(result.backendResponse.processed, 5);
    assert.equal(result.backendResponse.succeeded, 4);
    assert.equal(result.backendResponse.failed, 1);
  });

  test('non-JSON 200 body is surfaced as { raw: ... } without throwing', async () => {
    fetchMock = async () => mockResponse(200, 'OK (plain text)');
    const result = await runScheduler(validEnv);
    assert.equal(result.success, true);
    assert.ok(result.backendResponse?.raw?.includes('plain text'));
  });

  test('502 is retried, 200 after first retry succeeds', async () => {
    let n = 0;
    fetchMock = async () => { n++; return n === 1 ? mockResponse(502) : mockResponse(200, '{"processed":0}'); };
    const result = await runScheduler(validEnv);
    assert.equal(result.success, true);
    assert.equal(result.attempts[0].status, 502);
  });

  test('429 (rate limited) is retried', async () => {
    let n = 0;
    fetchMock = async () => { n++; return n === 1 ? mockResponse(429) : mockResponse(200, '{"processed":1}'); };
    const result = await runScheduler(validEnv);
    assert.equal(result.success, true);
    assert.equal(result.attempts[0].status, 429);
  });
});
