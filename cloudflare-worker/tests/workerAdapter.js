/**
 * workerAdapter.js
 *
 * CommonJS re-export of the pure business logic from src/index.js.
 * The actual Worker uses ES module `export default` syntax and Cloudflare
 * globals; this adapter is a CommonJS translation so Node's built-in test
 * runner can `require()` the logic without a full Workers runtime.
 *
 * IMPORTANT: Keep this file byte-for-byte equivalent to the corresponding
 * functions in src/index.js.  Any change to the retry logic, back-off
 * calculation, or secret header name must be mirrored here.
 */

'use strict';

// ── Constants (mirrored from src/index.js) ───────────────────────────────────

const BACKEND_URL =
  'https://spendwise-pro-14rv.onrender.com/api/recurring/process-due';
const MAX_ATTEMPTS = 3;
const INITIAL_BACKOFF_MS = 2000;
const MAX_BACKOFF_MS = 8000;
const FETCH_TIMEOUT_MS = 25000;
const RETRYABLE_STATUS_CODES = new Set([429, 502, 503, 504]);

// ── Helpers ──────────────────────────────────────────────────────────────────

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Exponential back-off with ±20 % jitter.
 * @param {number} attempt  0-indexed retry gap number.
 */
function backoffMs(attempt) {
  const base = Math.min(INITIAL_BACKOFF_MS * 2 ** attempt, MAX_BACKOFF_MS);
  const jitter = base * 0.2 * (Math.random() * 2 - 1);
  return Math.round(base + jitter);
}

function responseTag(res) {
  return `HTTP ${res.status} ${res.statusText || ''}`.trim();
}

// ── Core fetch logic ─────────────────────────────────────────────────────────

async function callBackend(cronSecret) {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);

  try {
    // Node 18+ has a global fetch; the test harness may also stub it.
    const res = await fetch(BACKEND_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-cron-secret': cronSecret,
      },
      signal: controller.signal,
    });

    clearTimeout(timeoutId);

    let body = null;
    try { body = await res.text(); } catch { /* non-fatal */ }

    return { ok: res.ok, status: res.status, body, error: null };
  } catch (err) {
    clearTimeout(timeoutId);
    const isTimeout = err.name === 'AbortError';
    return {
      ok: false,
      status: null,
      body: null,
      error: isTimeout ? `Request timed out after ${FETCH_TIMEOUT_MS} ms` : err.message,
    };
  }
}

// ── Scheduler ────────────────────────────────────────────────────────────────

async function runScheduler(env) {
  const startedAt = new Date().toISOString();

  if (!env.CRON_SECRET) {
    const msg = '[SpendWise Scheduler] CRON_SECRET is not configured — aborting.';
    console.error(msg);
    return { success: false, startedAt, finishedAt: new Date().toISOString(), error: msg, attempts: [] };
  }

  const attempts = [];
  let lastResult = null;

  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
    lastResult = await callBackend(env.CRON_SECRET);

    attempts.push({
      attempt,
      at: new Date().toISOString(),
      status: lastResult.status,
      ok: lastResult.ok,
      error: lastResult.error ?? undefined,
    });

    if (lastResult.ok) {
      let parsedBody = null;
      try {
        parsedBody = lastResult.body ? JSON.parse(lastResult.body) : null;
      } catch {
        parsedBody = { raw: lastResult.body };
      }
      return {
        success: true,
        startedAt,
        finishedAt: new Date().toISOString(),
        attempts,
        backendResponse: parsedBody,
      };
    }

    const isPermanentHttpError =
      lastResult.status !== null && !RETRYABLE_STATUS_CODES.has(lastResult.status);

    if (isPermanentHttpError) break;

    if (attempt < MAX_ATTEMPTS) {
      const delay = backoffMs(attempt - 1);
      await sleep(delay);
    }
  }

  const finalError =
    lastResult?.error ??
    (lastResult?.status != null ? `Backend returned ${lastResult.status}` : 'Unknown error');

  return {
    success: false,
    startedAt,
    finishedAt: new Date().toISOString(),
    attempts,
    error: finalError,
  };
}

module.exports = { callBackend, runScheduler, backoffMs };
