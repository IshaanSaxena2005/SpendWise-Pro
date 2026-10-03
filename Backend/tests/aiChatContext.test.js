/**
 * AI chatbot financial-context SQL regression tests.
 *
 * Production (TiDB on Railway) rejected the budget context query with:
 *   "Expression #1 of SELECT list is not in GROUP BY clause and contains
 *    nonaggregated column 'railway.c.name' ... incompatible with
 *    sql_mode=only_full_group_by"
 *
 * MySQL 8 ACCEPTS those queries because it infers functional dependency across a
 * join (b.id -> b.category_id = c.id -> c.name); TiDB does not. So the queries
 * are executed against the real local database with ONLY_FULL_GROUP_BY forced
 * on, AND statically audited for the cross-table dependency TiDB rejects.
 *
 * Run with:  cd Backend && npm test
 */
const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

require('dotenv').config();
const pool = require('../config/db');
const { buildFinancialContext } = require('../services/aiChatService');

const SOURCE_PATH = path.join(__dirname, '..', 'services', 'aiChatService.js');

// ── Fixtures ─────────────────────────────────────────────────────────────────
const EMAIL = `ai_ctx_${Date.now()}@example.com`;
let userId = null;
let foodId = null;
let travelId = null;

const FOOD_LIMIT = 2000;
const TRAVEL_LIMIT = 5000;
const OVERALL_LIMIT = 10000;
// Food: 1250.50 + 200 = 1450.50 this month. Travel: 300.00.
const FOOD_SPENT = 1450.5;
const TRAVEL_SPENT = 300;

async function insertExpense(categoryId, amount, when) {
  await pool.query(
    `INSERT INTO expenses (user_id, category_id, amount, expense_date, note, title, transaction_type)
     VALUES (?, ?, ?, ${when}, 'ctx', 'ctx', 'expense')`,
    [userId, categoryId, amount]
  );
}

before(async () => {
  const [[mode]] = await pool.query('SELECT @@SESSION.sql_mode AS sql_mode');
  assert.match(
    mode.sql_mode,
    /ONLY_FULL_GROUP_BY/,
    'local MySQL must run with ONLY_FULL_GROUP_BY for this suite to mean anything'
  );

  const [u] = await pool.query(
    `INSERT INTO users (full_name, email, password_hash, is_verified, auth_provider, has_local_password)
     VALUES (?, ?, 'x', TRUE, 'email', TRUE)`,
    ['Ctx User', EMAIL]
  );
  userId = u.insertId;

  const [f] = await pool.query('INSERT INTO categories (user_id, name) VALUES (?, ?)', [userId, 'Food']);
  foodId = f.insertId;
  const [t] = await pool.query('INSERT INTO categories (user_id, name) VALUES (?, ?)', [userId, 'Travel']);
  travelId = t.insertId;
  // Income category: must be EXCLUDED from spending categories by name.
  await pool.query('INSERT INTO categories (user_id, name) VALUES (?, ?)', [userId, 'Salary']);

  const month = "DATE_FORMAT(CURDATE(), '%Y-%m-01')";
  await pool.query(
    `INSERT INTO budgets (user_id, category_id, amount_limit, month) VALUES (?, ?, ?, ${month})`,
    [userId, foodId, FOOD_LIMIT]
  );
  await pool.query(
    `INSERT INTO budgets (user_id, category_id, amount_limit, month) VALUES (?, ?, ?, ${month})`,
    [userId, travelId, TRAVEL_LIMIT]
  );
  // Overall budget (category_id IS NULL) — exercises the LEFT JOIN / COALESCE path.
  await pool.query(
    `INSERT INTO budgets (user_id, category_id, amount_limit, month) VALUES (?, NULL, ?, ${month})`,
    [userId, OVERALL_LIMIT]
  );

  await insertExpense(foodId, 1250.5, "DATE_FORMAT(CURDATE(), '%Y-%m-05')");
  await insertExpense(foodId, 200, "DATE_FORMAT(CURDATE(), '%Y-%m-06')");
  await insertExpense(travelId, 300, "DATE_FORMAT(CURDATE(), '%Y-%m-07')");
  // Last month, must not leak into this-month figures.
  await insertExpense(foodId, 999.25, "DATE_FORMAT(DATE_SUB(CURDATE(), INTERVAL 1 MONTH), '%Y-%m-05')");
  // Salary income this month.
  const [[salaryRow]] = await pool.query('SELECT id FROM categories WHERE user_id = ? AND name = ?', [userId, 'Salary']);
  await pool.query(
    `INSERT INTO expenses (user_id, category_id, amount, expense_date, note, title, transaction_type)
     VALUES (?, ?, 50000, DATE_FORMAT(CURDATE(), '%Y-%m-03'), 'salary', 'salary', 'income')`,
    [userId, salaryRow.id]
  );
});

after(async () => {
  if (!userId) return;
  for (const table of ['expenses', 'budgets', 'categories']) {
    await pool.query(`DELETE FROM ${table} WHERE user_id = ?`, [userId]);
  }
  await pool.query('DELETE FROM users WHERE id = ?', [userId]);
  await pool.end();
});

// ── A. The production failure ────────────────────────────────────────────────

test('A. financial context builds under ONLY_FULL_GROUP_BY (the production crash)', async () => {
  const [[mode]] = await pool.query('SELECT @@SESSION.sql_mode AS sql_mode');
  assert.match(mode.sql_mode, /ONLY_FULL_GROUP_BY/);

  let ctx = null;
  try {
    ctx = await buildFinancialContext(userId);
  } catch (err) {
    assert.fail(`buildFinancialContext threw: ${err.code || ''} ${err.message}`);
  }
  assert.ok(ctx, 'context must be an object, not null');
  assert.ok(Array.isArray(ctx.budgets));
});

test('A2. the offending budget queries no longer reference a joined column outside GROUP BY', async () => {
  const source = fs.readFileSync(SOURCE_PATH, 'utf8');
  const queries = source.match(/`[^`]*SELECT[^`]*GROUP BY[^`]*`/g) || [];
  assert.ok(queries.length >= 5, `expected several grouped queries, found ${queries.length}`);

  for (const q of queries) {
    // Only the GROUP BY clause itself — ORDER BY / LIMIT may repeat grouped
    // columns and would otherwise mask a missing GROUP BY entry.
    let groupBy = q.slice(q.lastIndexOf('GROUP BY') + 'GROUP BY'.length);
    groupBy = groupBy.split(/\b(ORDER BY|LIMIT|HAVING)\b/i)[0];

    // Aggregate arguments are legal outside GROUP BY; scalar wrappers such as
    // COALESCE(c.name, 'Overall') are NOT, so strip only real aggregates.
    let selectList = q.slice(q.indexOf('SELECT') + 'SELECT'.length, q.indexOf('FROM'));
    let prev = null;
    while (prev !== selectList) {
      prev = selectList;
      selectList = selectList.replace(/\b(SUM|COUNT|AVG|MIN|MAX|GROUP_CONCAT|STD|VAR)\s*\([^()]*\)/gi, '');
    }

    for (const ref of selectList.match(/\b[a-z]\.[a-z_]+\b/gi) || []) {
      assert.ok(
        groupBy.includes(ref),
        `"${ref}" is selected without being grouped (TiDB ONLY_FULL_GROUP_BY rejects this).\nQuery: ${q}`
      );
    }
  }
});

test('A3. GROUP BY is not silently widened with MAX()/MIN() aggregations of joined columns', () => {
  const source = fs.readFileSync(SOURCE_PATH, 'utf8');
  // MAX(c.name) etc. would hide the bug rather than fix it.
  assert.doesNotMatch(source, /\b(MAX|MIN|GROUP_CONCAT)\s*\(\s*c\./i);
});

// ── B. Correctness of the context the chatbot receives ───────────────────────

test('B. context returns correct user-scoped categories, totals and budgets', async () => {
  const ctx = await buildFinancialContext(userId);

  // Spending categories exclude income categories, ordered by amount desc.
  assert.deepEqual(
    ctx.topCategories.map((c) => [c.category, c.amount]),
    [['Food', FOOD_SPENT], ['Travel', TRAVEL_SPENT]]
  );
  assert.deepEqual(
    ctx.allCategories.map((c) => [c.category, c.amount]),
    [['Food', FOOD_SPENT], ['Travel', TRAVEL_SPENT]]
  );

  // Budgets: category rows get their name, the NULL-category row reads "Overall".
  const byName = Object.fromEntries(ctx.budgets.map((b) => [b.name, b]));
  assert.equal(byName.Food.limit, FOOD_LIMIT);
  assert.equal(byName.Food.spent, FOOD_SPENT);
  assert.equal(byName.Food.remaining, FOOD_LIMIT - FOOD_SPENT);
  assert.equal(byName.Travel.spent, TRAVEL_SPENT);
  assert.equal(byName.Overall.limit, OVERALL_LIMIT);
  assert.equal(byName.Overall.spent, 0);
  assert.equal(ctx.budgets.length, 3, 'one row per budget — GROUP BY must not collapse or duplicate rows');

  // Money totals: income counted, last month excluded.
  assert.equal(ctx.thisMonthSpending, FOOD_SPENT + TRAVEL_SPENT);
  assert.equal(ctx.thisMonthIncome, 50000);
  assert.equal(ctx.lastMonthSpending, 999.25);
});

// ── G. Isolation ─────────────────────────────────────────────────────────────

test('G. another user cannot appear in this user\'s context', async () => {
  const [other] = await pool.query(
    `INSERT INTO users (full_name, email, password_hash, is_verified, auth_provider, has_local_password)
     VALUES (?, ?, 'x', TRUE, 'email', TRUE)`,
    ['Other', `ai_ctx_other_${Date.now()}@example.com`]
  );
  const otherId = other.insertId;
  try {
    const [oc] = await pool.query('INSERT INTO categories (user_id, name) VALUES (?, ?)', [otherId, 'SECRET_CATEGORY']);
    await pool.query(
      `INSERT INTO expenses (user_id, category_id, amount, expense_date, note, title, transaction_type)
       VALUES (?, ?, 7777, CURDATE(), 'SECRET_MARKER', 'SECRET_TITLE', 'expense')`,
      [otherId, oc.insertId]
    );

    const ctx = await buildFinancialContext(userId);
    const serialised = JSON.stringify(ctx);
    assert.doesNotMatch(serialised, /SECRET_CATEGORY|SECRET_MARKER|SECRET_TITLE|7777/);

    // The reverse direction: they see only their own rows, and none of ours.
    const theirs = await buildFinancialContext(otherId);
    assert.deepEqual(
      theirs.topCategories.map((c) => [c.category, c.amount]),
      [['SECRET_CATEGORY', 7777]],
      'a user sees exactly their own categories'
    );
    assert.deepEqual(theirs.budgets, [], 'and never our budgets');
    assert.equal(theirs.thisMonthSpending, 7777);
    assert.doesNotMatch(JSON.stringify(theirs), /Food|Travel/);
  } finally {
    for (const table of ['expenses', 'categories']) {
      await pool.query(`DELETE FROM ${table} WHERE user_id = ?`, [otherId]);
    }
    await pool.query('DELETE FROM users WHERE id = ?', [otherId]);
  }
});

test('G2. an unknown user id yields an empty context rather than throwing', async () => {
  const ctx = await buildFinancialContext(0);
  assert.deepEqual(ctx.topCategories, []);
  assert.deepEqual(ctx.budgets, []);
  assert.equal(ctx.thisMonthSpending, 0);
});