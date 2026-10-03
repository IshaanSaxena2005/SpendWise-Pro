/**
 * Spending-analysis intent tests — full category breakdown, target maths,
 * conversation-scoped exclusions, and user isolation.
 *
 * Runs against the real local database with throwaway users deleted in after().
 * Gemini is never reached: every question here matches the deterministic intent.
 *
 * Run with:  cd Backend && npm test
 */
const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');

require('dotenv').config();
const pool = require('../config/db');
const { handleAIChat, buildFinancialContext } = require('../services/aiChatService');

// Last-month figures for user A (transaction_type is not filtered, matching
// getLastMonthSpending so a follow-up total always agrees with it).
const LAST_MONTH = {
  Food: 1628.27,
  Travel: 4000,
  Shopping: 1500,
  Bills: 8000,
  Entertainment: 600,
  Fuel: 900,
};
const EXTRA_FOOD = 120; // second Food transaction, so Food totals 1748.27
const A_TOTAL = Object.values(LAST_MONTH).reduce((s, v) => s + v, 0) + EXTRA_FOOD;

const emails = {
  a: `spend_a_${Date.now()}@example.com`,
  b: `spend_b_${Date.now()}@example.com`,
  c: `spend_c_${Date.now()}@example.com`,
};
const ids = {};

async function mkUser(key) {
  const [u] = await pool.query(
    `INSERT INTO users (full_name, email, password_hash, is_verified, auth_provider, has_local_password)
     VALUES (?, ?, 'x', TRUE, 'email', TRUE)`,
    ['Spend User', emails[key]]
  );
  ids[key] = u.insertId;
  return u.insertId;
}

async function addExpense(userId, categoryName, amount, type = 'expense') {
  const [c] = await pool.query(
    'INSERT INTO categories (user_id, name) VALUES (?, ?)',
    [userId, categoryName]
  );
  await pool.query(
    `INSERT INTO expenses (user_id, category_id, amount, expense_date, note, title, transaction_type)
     VALUES (?, ?, ?, DATE_FORMAT(DATE_SUB(CURDATE(), INTERVAL 1 MONTH), '%Y-%m-05'), 'lm', 'lm', ?)`,
    [userId, c.insertId, amount, type]
  );
}

before(async () => {
  const a = await mkUser('a');
  for (const [name, amount] of Object.entries(LAST_MONTH)) {
    await addExpense(a, name, amount);
  }
  // A second, older transaction in Food so the "N transactions" hint is real.
  const [foodRows] = await pool.query('SELECT id FROM categories WHERE user_id = ? AND name = ?', [a, 'Food']);
  await pool.query(
    `INSERT INTO expenses (user_id, category_id, amount, expense_date, note, title, transaction_type)
     VALUES (?, ?, ?, DATE_FORMAT(DATE_SUB(CURDATE(), INTERVAL 1 MONTH), '%Y-%m-09'), 'lm2', 'lm2', 'expense')`,
    [a, foodRows[0].id, EXTRA_FOOD]
  );

  const b = await mkUser('b');
  await addExpense(b, 'Food', 800);
  await addExpense(b, 'Subscriptions', 500);
  await addExpense(b, 'Travel', 1000);

  const c = await mkUser('c');
  await addExpense(c, 'Food', 99999);
});

after(async () => {
  for (const id of Object.values(ids)) {
    if (!id) continue;
    for (const table of ['expenses', 'categories']) {
      await pool.query(`DELETE FROM ${table} WHERE user_id = ?`, [id]);
    }
    await pool.query('DELETE FROM users WHERE id = ?', [id]);
  }
  await pool.end();
});

const A = () => ids.a;

// ── A. full breakdown, not a single category ─────────────────────────────────

test('A. "analyse my last month spending" returns the full category analysis', async () => {
  const out = await handleAIChat(A(), 'analyse my last month spending');

  assert.match(out, /full last month spending/i, 'framed as a full analysis');
  assert.match(out, new RegExp(A_TOTAL.toFixed(2)), 'includes the real total');
  for (const name of Object.keys(LAST_MONTH)) {
    assert.ok(out.includes(name), `breakdown lists ${name}`);
  }
  assert.ok(!/You spent ₹[\d,.]+ on \*\*[^*]+\*\* last month\./.test(out),
    'must not degrade to the single-category reply');
});

test('A2. every claimed breakdown line matches a real DB row', async () => {
  const out = await handleAIChat(A(), 'analyse my last month spending');
  // Pull each "• Name — ₹amount" pair out of the reply and check it against the DB.
  const claimed = [...out.matchAll(/^• ([^—\n]+?) — ₹([\d,.]+)/gm)].map((m) => [
    m[1].trim(),
    Number(m[2].replace(/,/g, '')),
  ]);
  assert.ok(claimed.length >= 6, `expected the full breakdown, saw ${claimed.length} lines`);
  const expectedFood = LAST_MONTH.Food + EXTRA_FOOD;
  for (const [name, amount] of claimed) {
    const key = Object.keys(LAST_MONTH).find((k) => k.toLowerCase() === name.toLowerCase());
    const expected = key === 'Food' ? expectedFood : LAST_MONTH[key];
    assert.equal(amount, expected, `${name} amount must match the database`);
  }
});

// ── B. reduction suggestions use actual categories ───────────────────────────

test('B. "how can I reduce my spending?" uses the categories actually spent on', async () => {
  const out = await handleAIChat(A(), 'how can I reduce my last month spending?');

  assert.match(out, /Travel/, 'the largest discretionary category is surfaced');
  assert.match(out, /reduce ~₹/, 'concrete reduction amounts are given');
  // Bills are essential — they must not be presented as a cut opportunity.
  const billsLine = out.split('\n').find((l) => l.includes('Bills'));
  assert.ok(billsLine, 'Bills still appears in the breakdown');
  assert.match(billsLine, /essential/i, 'Bills is marked essential, not reducible');
  assert.ok(!/Bills[^•\n]*reduce ~₹/.test(out), 'Bills is never given a reduction figure');
});

// ── C. target maths ──────────────────────────────────────────────────────────

test('C. "I want to reduce to 15000" calculates the gap correctly', async () => {
  const out = await handleAIChat(A(), `I want to reduce my last month spending from ${A_TOTAL.toFixed(2)} to 15000`);

  assert.match(out, /Target: ₹15000\.00/, 'target echoed');
  assert.match(out, new RegExp(`need to cut ₹${(A_TOTAL - 15000).toFixed(2)}`), 'gap = total − target, computed exactly');
  assert.match(out, /≈ ₹/, 'a combination is planned');
});

test('C2. "how can i decrease it to 20000" is answered from the same period', async () => {
  const out = await handleAIChat(A(), 'how can i decrease my last month spending to 15000');
  assert.match(out, /Target: ₹15000\.00/);
  assert.match(out, new RegExp(`need to cut ₹${(A_TOTAL - 15000).toFixed(2)}`), 'gap computed against real spending');
  // Target above actual spend ⇒ nothing to cut, and no bogus advice.
  const high = await handleAIChat(A(), 'decrease my last month spending to 999999');
  assert.match(high, /need to cut ₹0\.00/, 'no negative gap when already under target');
  assert.ok(!/Most of your spending is on essentials/.test(high), 'no advice when already under target');
});

// ── D/E/F. conversation-scoped exclusions ───────────────────────────────────

test('D. "OTT I don\'t use" is honoured and OTT is never recommended after', async () => {
  const history = [
    { role: 'user', content: 'analyse my last month spending' },
    { role: 'ai', content: 'ok' },
    { role: 'user', content: 'OTT I don\'t use' },
  ];
  const out = await handleAIChat(ids.b, 'check my last month spending and tell me', history);

  assert.match(out, /won't suggest Subscriptions/i, 'the exclusion is acknowledged');
  const plan = (out.split('Biggest realistic areas to reduce:')[1] || '').split('A realistic combination')[0];
  const planBullets = plan.split('\n').filter((l) => l.trim().startsWith('•'));
  assert.ok(planBullets.length > 0, 'a plan is still produced');
  assert.ok(!planBullets.some((l) => l.includes('Subscriptions')),
    'Subscriptions is absent from every recommendation line');
  assert.match(out, /Travel — ₹1000\.00/, 'real categories are still recommended');
  // It stays visible as data, just not as advice.
  assert.match(out, /Subscriptions — ₹500\.00 — skipped/, 'shown as skipped, not invented');
});

test('D2. without the exclusion, Subscriptions IS recommended', async () => {
  const out = await handleAIChat(ids.b, 'analyse my last month spending');
  assert.match(out, /Subscriptions — ₹500\.00/, 'present in the breakdown');
  const plan = out.split('Biggest realistic areas')[1] || '';
  assert.match(plan, /Subscriptions/, 'recommended when the user has not ruled it out');
});

test('E. "2-3 food orders are okay" leaves Food reducible but modest', async () => {
  const history = [
    { role: 'user', content: 'analyse my last month spending then tell, 2-3 food order is ok but ott i dont use. so check' },
  ];
  const out = await handleAIChat(A(), 'analyse my last month spending then tell, 2-3 food order is ok but ott i dont use. so check', history);

  assert.match(out, /full last month spending/i, 'the long compound query is analysed');
  const foodLine = out.split('\n').find((l) => l.startsWith('• Food') && l.includes('reduce'));
  assert.ok(foodLine, 'Food is still offered as a modest reduction');
  // Food total is 1748.27; semi tier brackets 20–35% ⇒ ~350–610, never the whole spend.
  const cut = Number(/reduce ~₹([\d,]+)/.exec(foodLine)[1].replace(/,/g, ''));
  assert.ok(cut > 0 && cut < 1748.27 * 0.4, `Food cut ${cut} must be modest, not the full amount`);
});

test('F. a user with no OTT spending is never told to cancel OTT', async () => {
  const out = await handleAIChat(A(), 'analyse my last month spending');
  assert.doesNotMatch(out, /OTT/i, 'no OTT advice for a user who has none');
  assert.doesNotMatch(out, /Subscription/i, 'no subscription advice either');
  assert.ok(!/Netflix|Prime|Hotstar/.test(out), 'no invented subscription brands');
});

test('F2. no data ⇒ an honest empty answer rather than invented categories', async () => {
  const [u] = await pool.query(
    `INSERT INTO users (full_name, email, password_hash, is_verified, auth_provider, has_local_password)
     VALUES (?, ?, 'x', TRUE, 'email', TRUE)`,
    ['Empty', `spend_empty_${Date.now()}@example.com`]
  );
  try {
    const out = await handleAIChat(u.insertId, 'analyse my last month spending');
    assert.match(out, /no expenses recorded/i);
    assert.doesNotMatch(out, /reduce ~₹/, 'no recommendations invented');
  } finally {
    await pool.query('DELETE FROM users WHERE id = ?', [u.insertId]);
  }
});

// ── G. isolation ─────────────────────────────────────────────────────────────

test('G. the breakdown is user-scoped', async () => {
  const out = await handleAIChat(A(), 'analyse my last month spending');
  assert.doesNotMatch(out, /99999/, "user C's amount never appears");
  const cOut = await handleAIChat(ids.c, 'analyse my last month spending');
  assert.match(cOut, /99999/, 'user C sees their own data');
  assert.ok(!/Travel/.test(cOut.split('Full breakdown')[1] || ''), 'and not user A\'s categories');
});

test('G2. the Gemini context now carries the last-month breakdown', async () => {
  const ctx = await buildFinancialContext(A());
  assert.ok(Array.isArray(ctx.lastMonthCategories), 'context exposes lastMonthCategories');
  const food = ctx.lastMonthCategories.find((c) => c.category === 'Food');
  assert.ok(food, 'Food is in the last-month context');
  assert.equal(food.amount, LAST_MONTH.Food + EXTRA_FOOD);
});

// ── Language mirroring ──────────────────────────────────────────────────────
// detectChatLanguage (already used by the other handlers) picks the bucket:
// 'hi' for Devanagari, 'hinglish' for romanised Hindi, 'en' otherwise.
const DEVANAGARI = /[ऀ-ॿ]/;

test('1. English analysis stays English and unchanged', async () => {
  const out = await handleAIChat(A(), 'analyse my last month spending');
  assert.match(out, /^Yes — I checked your full last month spending\./);
  assert.match(out, /Total: ₹/);
  assert.match(out, /Full breakdown last month:/);
  assert.match(out, /Biggest realistic areas to reduce:/);
  assert.ok(!DEVANAGARI.test(out), 'no Devanagari in an English reply');
});

test('2. Hindi query returns a Hindi analysis with the same real numbers', async () => {
  const out = await handleAIChat(A(), 'मेरे पिछले महीने का खर्चा बताओ और बताओ कहां से कम कर सकता हूं');

  assert.ok(DEVANAGARI.test(out), 'reply is in Devanagari');
  assert.match(out, new RegExp(A_TOTAL.toFixed(2)), 'the real total is still quoted');
  for (const name of Object.keys(LAST_MONTH)) {
    assert.ok(out.includes(name), `${name} still listed from the DB`);
  }
  assert.match(out, /लक्ष्य|कुल/);
});

test('3. Hinglish query returns Hinglish with the same real numbers', async () => {
  const out = await handleAIChat(
    A(),
    'last month ka spending check karke batao kahan se kam kar sakta hu'
  );
  assert.ok(!DEVANAGARI.test(out), 'romanised, not Devanagari');
  assert.match(out, /Haan — maine aapka pichhle mahine ka poora kharcha check kar liya hai\./);
  assert.match(out, new RegExp(A_TOTAL.toFixed(2)), 'the real total is still quoted');
  assert.match(out, /Sabse zyada bachat yahan ho sakti hai:/);
});

test('4. Hindi + target amount computes the same gap as English', async () => {
  const out = await handleAIChat(A(), 'मेरे पिछले महीने का खर्चा 15000 तक कैसे कम करूं');
  assert.match(out, /लक्ष्य: ₹15000\.00/, 'Hindi target label');
  assert.match(out, new RegExp(`₹${(A_TOTAL - 15000).toFixed(2)} कम करना है`), 'gap computed exactly');
});

test('4b. Hinglish "10000 tak" target is parsed too', async () => {
  const out = await handleAIChat(A(), 'pichle mahine ka kharcha 10000 tak kaise kam karein');
  assert.match(out, /Target: ₹10000\.00/);
  assert.match(out, new RegExp(`₹${(A_TOTAL - 10000).toFixed(2)} kam karna hai`));
});

test('5. Hinglish honours "OTT I don\'t use" and still mirrors the language', async () => {
  const history = [{ role: 'user', content: "OTT I don't use" }];
  const out = await handleAIChat(ids.b, 'last month ka kharcha check karke batao', history);

  assert.match(out, /Main Subscriptions ke baare mein suggest nahi karunga/, 'Hinglish exclusion line');
  const plan = (out.split(/Sabse zyada bachat yahan ho sakti hai:/)[1] || '').split('Ek realistic combination')[0];
  assert.ok(
    !plan.split('\n').filter((l) => l.trim().startsWith('•')).some((l) => l.includes('Subscriptions')),
    'Subscriptions absent from every recommendation line'
  );
  assert.match(out, /Travel — ₹1000\.00/, 'real categories still recommended');
});

test('5b. Hindi mirrors the exclusion too', async () => {
  const history = [{ role: 'user', content: 'OTT I don\'t use' }];
  const out = await handleAIChat(ids.b, 'मेरे पिछले महीने का खर्चा बताओ और कहां से कम कर सकता हूं', history);
  assert.match(out, /सुझाव नहीं दूँगा/, 'Hindi exclusion line');
  assert.ok(!/Netflix|Prime/.test(out), 'no invented brands');
});

test('6. English output is byte-identical to the pre-change wording', async () => {
  // Guards against a language refactor quietly rewording the English copy.
  const out = await handleAIChat(A(), 'analyse my last month spending');
  for (const phrase of [
    'Yes — I checked your full last month spending.',
    'Full breakdown last month:',
    'Biggest realistic areas to reduce:',
    'A realistic combination:',
    'That would bring you to about ₹',
    ' — essential, not a place to cut',
  ]) {
    assert.ok(out.includes(phrase), `English copy must still contain: ${phrase}`);
  }
});

test('7. every Hindi/Hinglish phrasing routes to the analysis intent, not another one', () => {
  const { INTENT_PATTERNS } = require('../services/aiChatService');
  const route = (q) => {
    for (const intent of INTENT_PATTERNS) {
      if (intent.patterns.some((p) => p.test(q))) return intent.handler;
    }
    return '(gemini)';
  };
  assert.equal(route('pichle mahine mera spending analyse karo'), 'analyseSpending');
  assert.equal(route('last month ka spending check karke batao kahan se kam kar sakta hu'), 'analyseSpending');
  assert.equal(route('pichle mahine ka kharcha kam kaise karein'), 'analyseSpending');
  assert.equal(route('pichle mahine ka kharcha 20000 tak kaise kam karein'), 'analyseSpending');
  assert.equal(route('मेरे पिछले महीने का खर्चा बताओ और बताओ कहां से कम कर सकता हूं'), 'analyseSpending');
  assert.equal(route('मेरे खर्चे का विश्लेषण करो'), 'analyseSpending');

  // Plain "how much" questions must NOT be captured by the analysis intent.
  assert.notEqual(route('पिछले महीने का खर्चा कितना था'), 'analyseSpending');
  assert.notEqual(route('kitna kharch hua last month'), 'analyseSpending');
  assert.equal(route('compare this month vs last month'), 'compareThisVsLastMonth');
  assert.equal(route('how much did I save'), 'getSavingsAmount');
  assert.equal(route('how can I save money'), 'getSavingsTips');
});

test('8. language mirroring does not leak another user\'s data', async () => {
  for (const q of [
    'analyse my last month spending',
    'last month ka spending check karke batao kahan se kam kar sakta hu',
    'मेरे पिछले महीने का खर्चा बताओ और बताओ कहां से कम कर सकता हूं',
  ]) {
    const out = await handleAIChat(A(), q);
    assert.doesNotMatch(out, /99999/, `user C leaked for: ${q}`);
    assert.match(out, new RegExp(A_TOTAL.toFixed(2)), `own data present for: ${q}`);
  }
});

// ── H/I. existing intents untouched ──────────────────────────────────────────

test('H. "what was my last month expense?" is unchanged by the new intent', async () => {
  const out = await handleAIChat(A(), 'what was my last month expense?');
  assert.ok(out.length > 0, 'still answers');
  assert.ok(!/Biggest realistic areas|Full breakdown/.test(out),
    'still the short deterministic reply, not the analysis');
});

test('H2. bare "last month" follow-up still works', async () => {
  const out = await handleAIChat(A(), 'last month');
  assert.match(out, new RegExp(`₹${A_TOTAL.toFixed(2)}`), 'same real total as the analysis');
  assert.ok(!/Biggest realistic areas/.test(out));
});

test('I. "dish wash liquid kis category mein daalu?" still reaches the category intent', () => {
  // Checked at the routing layer: this question has no keyword match, so it
  // falls through to Gemini exactly as before. The point is that the new
  // analysis intent must not claim it.
  const { INTENT_PATTERNS } = require('../services/aiChatService');
  let handler = '(gemini)';
  for (const intent of INTENT_PATTERNS) {
    if (intent.patterns.some((p) => p.test('dish wash liquid kis category mein daalu?'))) {
      handler = intent.handler;
      break;
    }
  }
  assert.equal(handler, 'answerCategoryQuestion', 'category intent still gets first refusal');
});

// ── J. general questions are unaffected ──────────────────────────────────────

test('J. "who is Virat Kohli?" is not captured by the spending intent', async () => {
  const { INTENT_PATTERNS } = require('../services/aiChatService');
  let handler = '(gemini)';
  for (const intent of INTENT_PATTERNS) {
    if (intent.patterns.some((p) => p.test('who is Virat Kohli?'))) {
      handler = intent.handler;
      break;
    }
  }
  assert.equal(handler, '(gemini)', 'falls through to Gemini, as before');
});

test('J2. the anomaly intent is not stolen by "analyse"', async () => {
  const { INTENT_PATTERNS } = require('../services/aiChatService');
  let handler = '(gemini)';
  for (const intent of INTENT_PATTERNS) {
    if (intent.patterns.some((p) => p.test('can you analyse this unusual transaction'))) {
      handler = intent.handler;
      break;
    }
  }
  assert.equal(handler, 'getAnomalies');
});

test('J3. savings-amount and savings-tips intents are unaffected', async () => {
  const { INTENT_PATTERNS } = require('../services/aiChatService');
  const route = (q) => {
    for (const intent of INTENT_PATTERNS) {
      if (intent.patterns.some((p) => p.test(q))) return intent.handler;
    }
    return '(gemini)';
  };
  assert.equal(route('how much did I save'), 'getSavingsAmount');
  assert.equal(route('how can I save money'), 'getSavingsTips');
  assert.equal(route('how can I save 2000'), 'analyseSpending', 'a numeric save target is analysis');
});