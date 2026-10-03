/**
 * Gemini model-ladder fall-through tests.
 *
 * A per-request TIMEOUT used to abort the whole ladder, so one slow model turned
 * every chatbot question into a fallback reply even though the next rung would
 * have answered. These drive geminiService.generateContent directly with axios
 * stubbed, so the real ladder — and its retry rules — are exercised.
 *
 * No network access, no quota consumed.
 *
 * Run with:  cd Backend && npm test
 */
const { test, beforeEach, after } = require('node:test');
const assert = require('node:assert/strict');

require('dotenv').config();

// The key is only checked for presence; any non-empty value drives the ladder.
process.env.GEMINI_API_KEY = process.env.GEMINI_API_KEY || 'test_key_for_ladder_only';

// Stub axios.post BEFORE geminiService is loaded — it captures the module object.
const axios = require('axios');
let calls = [];
let handler = null;

const realPost = axios.post;
axios.post = async (url, body, config) => {
  const model = /\/models\/([^:]+):generateContent/.exec(url)?.[1] || 'unknown';
  calls.push({ model, url, body, config });
  return handler(model, calls.length, config);
};

const { generateContent } = require('../services/geminiService');

// The ladder as declared in the service, read from source so the test cannot
// silently drift if the model list is ever reordered or extended.
const LADDER = (() => {
  const src = require('node:fs').readFileSync(
    require('node:path').join(__dirname, '..', 'services', 'geminiService.js'),
    'utf8'
  );
  const match = src.match(/GENERATE_MODELS\s*=\s*\[([^\]]+)\]/);
  return match[1].split(',').map((s) => s.trim().replace(/^['"]|['"]$/g, ''));
})();

/** A provider error shaped exactly like axios' timeout. */
const timeoutError = (ms) => {
  const err = new Error(`timeout of ${ms}ms exceeded`);
  err.code = 'ECONNABORTED';
  err.config = { timeout: ms };
  return err;
};

/** A provider error shaped like a real axios HTTP response. */
const httpError = (status, message, googleStatus = null) => {
  const err = new Error(message);
  err.response = { status, data: { error: { code: status, message, status: googleStatus } } };
  return err;
};

const okResponse = (text) => ({
  status: 200,
  data: { candidates: [{ content: { parts: [{ text }] } }], usageMetadata: null },
});

beforeEach(() => {
  calls = [];
  handler = () => okResponse('{"answer":"ok","confidence":90,"category":"general"}');
});

// ── The fix: TIMEOUT falls through instead of aborting the ladder ────────────

test('a TIMEOUT on the first model falls through to the next model', async () => {
  handler = (model, n) => {
    if (n === 1) throw timeoutError(8000);
    return okResponse('{"answer":"recovered","confidence":90,"category":"general"}');
  };

  const res = await generateContent({ prompt: 'hello' });

  assert.equal(res.ok, true, 'the ladder recovered on a later model');
  assert.equal(res.text, '{"answer":"recovered","confidence":90,"category":"general"}');
  assert.equal(res.model, LADDER[1], 'the answer came from the SECOND model');
  assert.deepEqual(calls.map((c) => c.model), [LADDER[0], LADDER[1]]);
});

test('consecutive TIMEOUTs walk the whole ladder and succeed on the last rung', async () => {
  handler = (model, n) => {
    if (n < LADDER.length) throw timeoutError(8000);
    return okResponse('{"answer":"last rung","confidence":80,"category":"general"}');
  };

  const res = await generateContent({ prompt: 'hello' });

  assert.equal(res.ok, true);
  assert.equal(res.model, LADDER[LADDER.length - 1]);
  assert.deepEqual(calls.map((c) => c.model), LADDER);
});

test('if EVERY model times out, it fails cleanly without throwing', async () => {
  handler = () => {
    throw timeoutError(8000);
  };

  const res = await generateContent({ prompt: 'hello' });

  assert.equal(res.ok, false);
  assert.equal(res.reason, 'TIMEOUT');
  assert.equal(res.httpStatus, null);
  assert.equal(res.text, null);
  assert.equal(res.model, LADDER[LADDER.length - 1], 'reports the last model tried');
  assert.deepEqual(calls.map((c) => c.model), LADDER, 'every model was attempted');
});

// ── Retry rules preserved ───────────────────────────────────────────────────

test('a TIMEOUT is NOT retried on the same model (retry stays reserved for 503)', async () => {
  handler = () => {
    throw timeoutError(8000);
  };

  await generateContent({ prompt: 'hello' });

  assert.equal(
    calls.length,
    LADDER.length,
    `expected exactly one request per model, saw ${calls.length}`
  );
  assert.equal(new Set(calls.map((c) => c.model)).size, LADDER.length, 'no model was retried');
});

test('a 503 still retries once on the same model, then falls through', async () => {
  handler = (model, n) => {
    if (n <= 2) throw httpError(503, 'The model is overloaded. Please try again later.', 'UNAVAILABLE');
    return okResponse('{"answer":"after retry","confidence":90,"category":"general"}');
  };

  const res = await generateContent({ prompt: 'hello' });

  assert.equal(res.ok, true);
  assert.deepEqual(
    calls.map((c) => c.model),
    [LADDER[0], LADDER[0], LADDER[1]],
    '503: one short retry on the first model, then the next rung answers'
  );
});

test('a 429 still falls through to the next model without retrying', async () => {
  handler = (model, n) => {
    if (n === 1) throw httpError(429, 'Resource has been exhausted (e.g. check quota).', 'RESOURCE_EXHAUSTED');
    return okResponse('{"answer":"after quota","confidence":90,"category":"general"}');
  };

  const res = await generateContent({ prompt: 'hello' });

  assert.equal(res.ok, true);
  assert.deepEqual(calls.map((c) => c.model), [LADDER[0], LADDER[1]]);
});

// ── Other error handling unchanged ──────────────────────────────────────────

test('a hard failure (403 PERMISSION_DENIED) still aborts on the first model', async () => {
  handler = () => {
    throw httpError(403, 'API key not valid. Please pass a valid API key.', 'PERMISSION_DENIED');
  };

  const res = await generateContent({ prompt: 'hello' });

  assert.equal(res.ok, false);
  assert.equal(res.reason, 'PERMISSION_DENIED');
  assert.equal(calls.length, 1, 'a non-fall-through failure must not walk the ladder');
  assert.equal(res.model, LADDER[0]);
});

test('an invalid API key never reaches a second model', async () => {
  handler = () => {
    throw httpError(400, 'API key not valid. Please pass a valid API key.', 'API_KEY_INVALID');
  };

  const res = await generateContent({ prompt: 'hello' });

  assert.equal(res.ok, false);
  assert.equal(res.reason, 'API_KEY_INVALID');
  assert.equal(calls.length, 1);
});

test('the configured timeout duration is unchanged', async () => {
  await generateContent({ prompt: 'hello' });

  assert.equal(calls[0].config.timeout, 8000, 'GEMINI_TIMEOUT_MS must stay 8000');
});

test('a caller-supplied timeoutMs is still honoured, and still falls through', async () => {
  // callGeminiChat passes timeoutMs: 15000 explicitly, which overrides the default.
  handler = (model, n) => {
    if (n === 1) throw timeoutError(15000);
    return okResponse('{"answer":"recovered","confidence":90,"category":"general"}');
  };

  const res = await generateContent({ prompt: 'hello', timeoutMs: 15000 });

  assert.equal(calls[0].config.timeout, 15000, 'explicit timeout passes through unchanged');
  assert.equal(calls[1].config.timeout, 15000, 'and applies to every fallback model');
  assert.equal(res.ok, true);
  assert.equal(res.model, LADDER[1]);
});

test('a successful first model never touches the rest of the ladder', async () => {
  const res = await generateContent({ prompt: 'hello' });

  assert.equal(res.ok, true);
  assert.equal(res.model, LADDER[0]);
  assert.equal(calls.length, 1);
});

after(() => {
  axios.post = realPost;
});