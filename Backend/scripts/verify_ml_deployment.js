/**
 * Phase 4 — Post-deployment ML-Service verification (Parts 8/10/11 support).
 *
 * Usage (env):
 *   ML_SERVICE_URL=https://<your-ml-service-host> ML_API_KEY=<same secret> node scripts/verify_ml_deployment.js
 * Usage (args):
 *   node scripts/verify_ml_deployment.js https://<host> <key>
 *
 * Verifies against the LIVE deployed service:
 *   1. GET /health            -> 200 {"status":"healthy"} without auth
 *   2. POST /categorize       -> 401 without key, 401 with wrong key,
 *                                200 with correct key
 *   3. 8 categorize examples  -> each returns a valid canonical category +
 *                                numeric confidence (results are RECORDED,
 *                                not assumed)
 *   4. POST /forecast         -> 200 with correct key (sibling consumer path)
 *   5. POST /anomaly          -> 200 with correct key (sibling consumer path)
 *   6. /health leak check     -> response contains no key/env/database hints
 *
 * Exit code 0 = all critical checks passed.
 */
const https = require('https');
const http = require('http');

const CANONICAL = ['Food', 'Shopping', 'Bills', 'Travel', 'Entertainment', 'Health', 'Fuel', 'Salary'];

let BASE = process.env.ML_SERVICE_URL || '';
let KEY = process.env.ML_API_KEY || '';
if (process.argv[2]) BASE = process.argv[2];
if (process.argv[3]) KEY = process.argv[3];

if (!BASE || !KEY) {
  console.error('Usage: ML_SERVICE_URL=<url> ML_API_KEY=<key> node scripts/verify_ml_deployment.js');
  console.error('   or: node scripts/verify_ml_deployment.js <url> <key>');
  process.exit(2);
}
BASE = BASE.replace(/\/+$/, '');
if (BASE.includes('localhost') || BASE.includes('127.0.0.1')) {
  console.error('[abort] refusing to run deployment verification against localhost');
  process.exit(2);
}

function request(path, method, body, headers = {}) {
  return new Promise((resolve, reject) => {
    const url = new URL(BASE + path);
    const mod = url.protocol === 'https:' ? https : http;
    const payload = body ? JSON.stringify(body) : null;
    const req = mod.request(
      {
        hostname: url.hostname,
        port: url.port || (url.protocol === 'https:' ? 443 : 80),
        path: url.pathname + url.search,
        method,
        headers: {
          ...(payload ? { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(payload) } : {}),
          ...headers,
        },
        timeout: 15000,
      },
      (res) => {
        let data = '';
        res.on('data', (c) => (data += c));
        res.on('end', () => resolve({ status: res.statusCode, body: data }));
      }
    );
    req.on('timeout', () => req.destroy(new Error('timeout')));
    req.on('error', reject);
    if (payload) req.write(payload);
    req.end();
  });
}

const results = [];
function check(name, ok, detail = '') {
  results.push(ok);
  console.log(`[${ok ? 'PASS' : 'FAIL'}] ${name}${detail ? ' — ' + detail : ''}`);
}

async function main() {
  // 1. health, no auth
  const health = await request('/health', 'GET');
  check('GET /health -> 200 without auth', health.status === 200, health.body.slice(0, 60));
  const leaks = /key|env|password|database|secret/i.test(health.body) && /status/.test(health.body) ? health.body : '';
  check('GET /health leaks nothing sensitive', health.status !== 200 || !leaks, leaks || 'clean');

  // 2. auth matrix on /categorize
  const noKey = await request('/categorize', 'POST', { description: 'coffee' });
  check('POST /categorize without key -> 401', noKey.status === 401, `got ${noKey.status}`);
  const badKey = await request('/categorize', 'POST', { description: 'coffee' }, { 'x-ml-api-key': 'definitely-wrong' });
  check('POST /categorize wrong key -> 401', badKey.status === 401, `got ${badKey.status}`);

  // 3. categorize examples (record actual results; validate shape + canonical class)
  const examples = [
    'Swiggy order', 'Amazon purchase', 'HP petrol pump', 'Netflix subscription',
    'doctor consultation', 'electricity bill', 'Uber ride', 'salary credited',
  ];
  let shapeOk = true;
  const recorded = [];
  for (const desc of examples) {
    const r = await request('/categorize', 'POST', { description: desc }, { 'x-ml-api-key': KEY });
    let parsed = null;
    try { parsed = JSON.parse(r.body); } catch {}
    const valid = r.status === 200 && parsed && CANONICAL.includes(parsed.category) && typeof parsed.confidence === 'number';
    if (!valid) shapeOk = false;
    recorded.push(`${desc} -> ${parsed ? `${parsed.category} @ ${parsed.confidence}` : `HTTP ${r.status}`}`);
    console.log(`        ${desc} -> ${parsed ? `${parsed.category} @ ${parsed.confidence}` : `HTTP ${r.status} (invalid response)`}`);
  }
  check('POST /categorize with correct key -> valid {category, confidence} for all examples', shapeOk);
  console.log('        recorded results:', JSON.stringify(recorded));

  // 4/5. sibling consumers
  const fc = await request('/forecast', 'POST', { history: [1000, 1200, 1100, 1400, 1300] }, { 'x-ml-api-key': KEY });
  check('POST /forecast with correct key -> 200', fc.status === 200, fc.body.slice(0, 80));
  const an = await request('/anomaly', 'POST', { history: [100, 150, 120, 130, 110, 125], current_expense: 50000 }, { 'x-ml-api-key': KEY });
  check('POST /anomaly with correct key -> 200', an.status === 200, an.body.slice(0, 80));

  const failed = results.filter((x) => !x).length;
  console.log(`\n${results.length - failed}/${results.length} checks passed`);
  process.exit(failed ? 1 : 0);
}

main().catch((e) => {
  console.error('VERIFICATION ERROR:', e.message);
  process.exit(1);
});
