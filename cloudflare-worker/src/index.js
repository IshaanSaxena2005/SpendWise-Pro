/**
 * SpendWise Pro — Recurring-Transaction Scheduler Worker
 *
 * Runs daily at 18:30 UTC (= 00:00 IST) via Cloudflare Cron Triggers.
 * Calls POST /api/recurring/process-due on the Render backend, authenticating
 * with x-cron-secret.
 *
 * Retry policy (fits within Cloudflare free-plan limits):
 *   - Up to MAX_ATTEMPTS total (initial + retries)
 *   - Retries only on transient errors: network failures and 429/502/503/504
 *   - Permanent errors (400, 401, 403, 404) are NOT retried
 *   - Exponential back-off with jitter between attempts
 *   - Total wall-clock time is kept well under the free-plan 30 s CPU limit
 *     (back-off caps at 8 s per gap; 3 retries → at most ~24 s of delay +
 *      fetch time, safe for a 30 s invocation window)
 *
 * Security:
 *   - CRON_SECRET is bound as a Cloudflare Worker secret (never in source).
 *   - The secret is NEVER logged, even partially.
 */

// ── Constants ────────────────────────────────────────────────────────────────

const BACKEND_URL =
  'https://spendwise-pro-14rv.onrender.com/api/recurring/process-due';

/** Total number of attempts (1 initial + up to 2 retries). */
const MAX_ATTEMPTS = 3;

/** Initial back-off in milliseconds before the second attempt. */
const INITIAL_BACKOFF_MS = 2000;

/** Back-off is doubled each retry, capped at this value. */
const MAX_BACKOFF_MS = 8000;

/** Per-attempt fetch timeout in milliseconds.
 *  Render cold-start can take ~15 s; use 25 s so we have room for 1 retry
 *  within the 30 s invocation window.  On Cloudflare Workers the
 *  `signal` option is respected and throws an AbortError on timeout. */
const FETCH_TIMEOUT_MS = 25000;

/**
 * HTTP status codes that are safe to retry (transient errors).
 * 429 = rate-limited, 502/503/504 = upstream/gateway unavailable.
 */
const RETRYABLE_STATUS_CODES = new Set([429, 502, 503, 504]);

// ── Helpers ──────────────────────────────────────────────────────────────────

/**
 * Sleep for `ms` milliseconds.  Works inside a Cloudflare Worker because the
 * platform supports Promise-based delays (no `setTimeout` needed).
 */
function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Compute exponential back-off with ±20 % random jitter.
 * @param {number} attempt  0-indexed attempt number (0 = first retry gap).
 * @returns {number}  Milliseconds to wait.
 */
function backoffMs(attempt) {
  const base = Math.min(INITIAL_BACKOFF_MS * 2 ** attempt, MAX_BACKOFF_MS);
  // jitter: ±20 % of base
  const jitter = base * 0.2 * (Math.random() * 2 - 1);
  return Math.round(base + jitter);
}

/**
 * Safe one-line summary of a fetch Response for logging.
 * Never exposes the CRON_SECRET (it is only ever in the request header,
 * which is not echoed here).
 */
function responseTag(res) {
  return `HTTP ${res.status} ${res.statusText || ''}`.trim();
}

// ── Core fetch logic ─────────────────────────────────────────────────────────

/**
 * Attempt a single POST to the backend.
 *
 * @param {string} cronSecret  The raw CRON_SECRET value (never logged).
 * @returns {Promise<{ok: boolean, status: number|null, body: string|null, error: string|null}>}
 */
async function callBackend(cronSecret) {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);

  try {
    const res = await fetch(BACKEND_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        // The backend reads x-cron-secret, NOT Authorization: Bearer.
        // See Backend/middleware/cronAuth.js → requireCronSecret.
        'x-cron-secret': cronSecret,
      },
      signal: controller.signal,
    });

    clearTimeout(timeoutId);

    let body = null;
    try {
      body = await res.text();
    } catch {
      // Body read failure is non-fatal for our purposes.
    }

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

// ── Main scheduled handler ───────────────────────────────────────────────────

/**
 * Cloudflare Workers entry point.
 *
 * `scheduled` is called by Cron Triggers.
 * `fetch` lets you trigger the worker manually via a plain HTTP request
 *  (useful for testing via `wrangler dev` or curl — protected by the
 *  same CRON_SECRET check so it cannot be abused in production).
 */
export default {
  // ── Cron trigger ──────────────────────────────────────────────────────────
  async scheduled(event, env, ctx) {
    ctx.waitUntil(runScheduler(env));
  },

  // ── Manual HTTP trigger (testing / debugging) ──────────────────────────────
  async fetch(request, env) {
    // Only allow POST to prevent accidental GET-based triggers.
    if (request.method !== 'POST') {
      return new Response('Method Not Allowed — use POST.', { status: 405 });
    }

    // Protect the manual trigger with the same secret.
    const provided = request.headers.get('x-cron-secret') ?? '';
    if (!env.CRON_SECRET || provided !== env.CRON_SECRET) {
      return new Response('Unauthorized', { status: 403 });
    }

    const result = await runScheduler(env);
    return new Response(JSON.stringify(result, null, 2), {
      status: result.success ? 200 : 502,
      headers: { 'Content-Type': 'application/json' },
    });
  },
};

// ── Scheduler implementation ─────────────────────────────────────────────────

/**
 * Execute the recurring-transaction scheduler with retry + back-off.
 *
 * @param {object} env  Cloudflare Worker environment bindings.
 * @returns {Promise<object>}  Structured result (logged by the caller).
 */
async function runScheduler(env) {
  const startedAt = new Date().toISOString();
  console.log(`[SpendWise Scheduler] Starting at ${startedAt}`);

  // Fail closed: if the secret is missing the worker is misconfigured.
  if (!env.CRON_SECRET) {
    const msg = '[SpendWise Scheduler] CRON_SECRET is not configured — aborting.';
    console.error(msg);
    return { success: false, startedAt, finishedAt: new Date().toISOString(), error: msg, attempts: [] };
  }

  const attempts = [];
  let lastResult = null;

  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
    console.log(`[SpendWise Scheduler] Attempt ${attempt}/${MAX_ATTEMPTS} — calling backend...`);

    lastResult = await callBackend(env.CRON_SECRET);

    const attemptLog = {
      attempt,
      at: new Date().toISOString(),
      status: lastResult.status,
      ok: lastResult.ok,
      error: lastResult.error ?? undefined,
    };
    attempts.push(attemptLog);

    if (lastResult.ok) {
      // ── Success ────────────────────────────────────────────────────────────
      let parsedBody = null;
      try {
        parsedBody = lastResult.body ? JSON.parse(lastResult.body) : null;
      } catch {
        parsedBody = { raw: lastResult.body };
      }

      console.log(
        `[SpendWise Scheduler] ✓ Success on attempt ${attempt}. ` +
          `processed=${parsedBody?.processed ?? '?'} ` +
          `succeeded=${parsedBody?.succeeded ?? '?'} ` +
          `failed=${parsedBody?.failed ?? '?'} ` +
          `skipped=${parsedBody?.skipped ?? '?'}`
      );

      return {
        success: true,
        startedAt,
        finishedAt: new Date().toISOString(),
        attempts,
        backendResponse: parsedBody,
      };
    }

    // ── Determine whether to retry ────────────────────────────────────────
    const isPermanentHttpError =
      lastResult.status !== null && !RETRYABLE_STATUS_CODES.has(lastResult.status);

    if (isPermanentHttpError) {
      // 400/401/403/404 — retrying will not help.
      console.error(
        `[SpendWise Scheduler] ✗ Permanent error on attempt ${attempt}: ${responseTag({ status: lastResult.status, statusText: '' })}. ` +
          'Not retrying.'
      );
      break;
    }

    if (attempt < MAX_ATTEMPTS) {
      // Transient error (network / 429 / 502-504): back off and retry.
      const delay = backoffMs(attempt - 1);
      const reason = lastResult.error ?? responseTag({ status: lastResult.status, statusText: '' });
      console.warn(
        `[SpendWise Scheduler] ⚠ Transient error on attempt ${attempt}: ${reason}. ` +
          `Retrying in ${delay} ms...`
      );
      await sleep(delay);
    }
  }

  // ── All attempts exhausted ────────────────────────────────────────────────
  const finalError =
    lastResult?.error ??
    (lastResult?.status != null
      ? `Backend returned ${lastResult.status}`
      : 'Unknown error');

  console.error(
    `[SpendWise Scheduler] ✗ All ${MAX_ATTEMPTS} attempts failed. ` +
      `Last error: ${finalError}. ` +
      'The next scheduled run will catch up on any overdue recurring transactions.'
  );

  return {
    success: false,
    startedAt,
    finishedAt: new Date().toISOString(),
    attempts,
    error: finalError,
  };
}
