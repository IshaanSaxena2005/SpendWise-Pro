/**
 * Forecast ML integration tests (ML service unavailable — root-cause fix).
 *
 * Run with:  cd Backend && node --test tests/forecastML.test.js
 *
 * Covers the full backend→ML request path with stubbed axios (deterministic,
 * no network, no database):
 *   - valid ML response   → forecast_source 'ml', confidence derived from the
 *                           model's own R² (never invented)
 *   - ML response without R² → honest low confidence (50), low-fit message
 *   - invalid ML response (malformed/negative/trend/twin-header URL guard) →
 *                           safe average fallback
 *   - 401 (key mismatch)  → fallback, distinct 'ml_auth_failed' category
 *   - 404 (wrong endpoint)| fallback with distinct category
 *   - cold-start timeout  → exactly ONE patient retry, then correct fallback
 *   - ML_SERVICE_URL unset / localhost → configuration-category fallback
 *   - <3 months history   → data-scarcity fallback, ML never called
 *   - fallback confidence never exceeds 50 (no fake model-grade confidence)
 *
 * Optional LIVE check against the real deployed service (real network):
 *   FORECAST_LIVE_TEST_URL=https://<ml-host> ML_API_KEY=<same secret> \
 *   node --test tests/forecastML.test.js
 * The key is only read from the environment and never printed.
 */
const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const axios = require('axios');

// Stub env for the offline tests: a fake base URL (never actually reached —
// axios is stubbed) and a sentinel key so header assertions are meaningful.
process.env.ML_SERVICE_URL = process.env.ML_SERVICE_URL || 'https://ml.test.local';
process.env.ML_API_KEY = process.env.ML_API_KEY || 'test-sentinel-key';

const { getNextMonthForecast } = require('../controllers/forecastController');

const HISTORY = [49699, 48709, 58453];

/** Minimal req/res doubles so controller handlers can be called directly. */
function fakeExchange({ user = { id: 42, email: 'real@spendwise.ai' } } = {}) {
  const res = {
    statusCode: 200,
    payload: null,
    status(code) { this.statusCode = code; return this; },
    json(obj) { this.payload = obj; return this; },
  };
  return { req: { user }, res };
}

/** Stub pool.query — the controller uses pool.query on the shared pool
// object; patch query on it for the duration of the test run. */
const pool = require('../config/db');
pool.query = async () => [HISTORY.map((total) => ({ total }))];

// Shared stub plumbing (same pattern as anomalyDetection.test.js).
const realAxiosPost = axios.post;
let calls = [];
function stubAxiosPost(impl) {
  calls = [];
  axios.post = async (...args) => {
    calls.push(args);
    return impl(...args);
  };
}

describe('forecast controller → ML integration', () => {
  test('valid ML response → forecast_source ml, confidence from R², values passed through', async () => {
    stubAxiosPost(async () => ({
      data: {
        predicted_spending: 56210.4,
        trend_direction: 'Increasing',
        mae: 1900.5,
        rmse: 2400.75,
        r2_score: 0.92,
      },
    }));
    const { req, res } = fakeExchange();
    await getNextMonthForecast(req, res);

    assert.equal(res.statusCode, 200);
    assert.equal(res.payload.forecast_source, 'ml');
    assert.equal(res.payload.predicted_spending, 56210.4);
    assert.equal(res.payload.trend_direction, 'Increasing');
    assert.deepEqual(res.payload.spending_history, HISTORY);
    assert.equal(res.payload.confidence, 92);
    assert.equal(res.payload.is_low_confidence, false);
    // Payload contract: { history: [...] } + x-ml-api-key header, no key leaks.
    assert.equal(calls.length, 1);
    assert.deepEqual(calls[0][1], { history: HISTORY });
    assert.equal(calls[0][2].headers['x-ml-api-key'], process.env.ML_API_KEY);
    axios.post = realAxiosPost;
  });

  test('ML response without R² → honest low confidence (50), low-fit message', async () => {
    stubAxiosPost(async () => ({
      data: { predicted_spending: 40000, trend_direction: 'Stable', mae: null, rmse: null, r2_score: null },
    }));
    const { req, res } = fakeExchange();
    await getNextMonthForecast(req, res);

    assert.equal(res.payload.forecast_source, 'ml');
    assert.equal(res.payload.confidence, 50);
    assert.equal(res.payload.is_low_confidence, true);
    assert.match(res.payload.message, /ML forecast/);
    axios.post = realAxiosPost;
  });

  test('invalid ML response (missing prediction) → safe average fallback', async () => {
    stubAxiosPost(async () => ({ data: { trend_direction: 'Increasing' } }));
    const { req, res } = fakeExchange();
    await getNextMonthForecast(req, res);

    assert.equal(res.payload.forecast_source, 'average_fallback');
    const avg = HISTORY.reduce((a, b) => a + b, 0) / 3;
    assert.equal(res.payload.predicted_spending, avg);
    assert.match(res.payload.message, /Using average spending as forecast/);
    assert.ok(res.payload.confidence <= 50);
    axios.post = realAxiosPost;
  });

  test('invalid ML response (negative / non-numeric / bogus trend) → safe fallback', async () => {
    for (const bad of [
      { predicted_spending: -5, trend_direction: 'Stable' },
      { predicted_spending: 'NaN-ish', trend_direction: 'Stable' },
      { predicted_spending: 100, trend_direction: 'EXLODING' },
    ]) {
      stubAxiosPost(async () => ({ data: bad }));
      const { req, res } = fakeExchange();
      await getNextMonthForecast(req, res);
      assert.equal(res.payload.forecast_source, 'average_fallback', JSON.stringify(bad));
      axios.post = realAxiosPost;
    }
  });

  test('HTTP 401 (key mismatch) → fallback with ml_auth_failed category', async () => {
    stubAxiosPost(async () => {
      const err = new Error('Request failed with status code 401');
      err.response = { status: 401, data: { error: 'Unauthorized' } };
      throw err;
    });
    const { req, res } = fakeExchange();
    await getNextMonthForecast(req, res);

    assert.equal(res.statusCode, 200);
    assert.equal(res.payload.forecast_source, 'average_fallback');
    assert.match(res.payload.message, /ML service unavailable \(ml_auth_failed\)/);
    assert.equal(calls.length, 1, 'auth failures must NOT trigger a cold-start retry');
    axios.post = realAxiosPost;
  });

  test('HTTP 404 (wrong endpoint) → fallback with ml_route_not_found category', async () => {
    stubAxiosPost(async () => {
      const err = new Error('Request failed with status code 404');
      err.response = { status: 404, data: {} };
      throw err;
    });
    const { req, res } = fakeExchange();
    await getNextMonthForecast(req, res);
    assert.match(res.payload.message, /\(ml_route_not_found\)/);
    axios.post = realAxiosPost;
  });

  test('cold-start timeout → exactly one patient retry, then honest fallback', async () => {
    stubAxiosPost(async () => {
      const err = new Error('timeout of Xms exceeded');
      err.code = 'ECONNABORTED';
      throw err;
    });
    const { req, res } = fakeExchange();
    await getNextMonthForecast(req, res);

    assert.equal(calls.length, 2, 'retry on cold-start-shaped failure');
    assert.equal(res.payload.forecast_source, 'average_fallback');
    assert.match(res.payload.message, /\(ml_timeout\)/);
    axios.post = realAxiosPost;
  });

  test('ML_SERVICE_URL unset → not-configured fallback, no HTTP call', async () => {
    const saved = process.env.ML_SERVICE_URL;
    delete process.env.ML_SERVICE_URL;
    stubAxiosPost(async () => ({ data: {} }));
    const { req, res } = fakeExchange();
    await getNextMonthForecast(req, res);

    assert.equal(calls.length, 0);
    assert.equal(res.payload.forecast_source, 'average_fallback');
    assert.match(res.payload.message, /ML service not configured/);
    process.env.ML_SERVICE_URL = saved;
    axios.post = realAxiosPost;
  });

  test('ML_SERVICE_URL pointing at localhost → config-error fallback, no HTTP call', async () => {
    const saved = process.env.ML_SERVICE_URL;
    process.env.ML_SERVICE_URL = 'http://localhost:5001';
    stubAxiosPost(async () => ({ data: {} }));
    const { req, res } = fakeExchange();
    await getNextMonthForecast(req, res);

    assert.equal(calls.length, 0);
    assert.match(res.payload.message, /\(ml_url_is_localhost\)/);
    process.env.ML_SERVICE_URL = saved;
    axios.post = realAxiosPost;
  });

  test('ML_SERVICE_URL already ending in /forecast → guarded, no doubled endpoint', async () => {
    const saved = process.env.ML_SERVICE_URL;
    process.env.ML_SERVICE_URL = 'https://ml.example.com/forecast';
    stubAxiosPost(async () => ({ data: {} }));
    const { req, res } = fakeExchange();
    await getNextMonthForecast(req, res);

    assert.equal(calls.length, 0);
    assert.equal(res.payload.forecast_source, 'average_fallback');
    process.env.ML_SERVICE_URL = saved;
    axios.post = realAxiosPost;
  });

  test('<3 months of history → fallback without ever calling ML', async () => {
    stubAxiosPost(async () => ({ data: {} }));
    pool.query = async () => [[{ total: 1100 }, { total: 1250 }]];
    const { req, res } = fakeExchange();
    await getNextMonthForecast(req, res);

    assert.equal(calls.length, 0);
    assert.equal(res.payload.forecast_source, 'average_fallback');
    assert.equal(res.payload.confidence, 30);
    assert.match(res.payload.message, /2 month/);
    pool.query = async () => [HISTORY.map((total) => ({ total }))];
    axios.post = realAxiosPost;
  });

  test('fallback confidence always ≤ 50 (covers ≥3-month fallback paths)', async () => {
    stubAxiosPost(async () => {
      const err = new Error('connect ECONNREFUSED');
      err.code = 'ECONNREFUSED';
      throw err;
    });
    const { req, res } = fakeExchange();
    await getNextMonthForecast(req, res);
    assert.ok(res.payload.confidence <= 50);
    // two attempts allowed for connection_refused (deploy restarts)
    assert.ok(calls.length >= 1);
    axios.post = realAxiosPost;
  });
});

// Optional real-network check — only when explicitly pointed at a deployed host.
if (process.env.FORECAST_LIVE_TEST_URL && process.env.ML_API_KEY) {
  test('LIVE: deployed ML /forecast returns a valid real prediction', async () => {
    const base = process.env.FORECAST_LIVE_TEST_URL.replace(/\/+$/, '');
    const res = await fetch(`${base}/forecast`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-ml-api-key': process.env.ML_API_KEY },
      body: JSON.stringify({ history: HISTORY }),
    });
    assert.equal(res.status, 200);
    const data = await res.json();
    assert.ok(Number.isFinite(Number(data.predicted_spending)));
    assert.ok(['Increasing', 'Decreasing', 'Stable'].includes(data.trend_direction));
  });
}
