const pool = require('../config/db');
const { DEMO_EMAIL } = require('../config/constants');
const {
  sendBudgetWarningEmail,
  sendBudgetExceededEmail,
  sendMonthlyReportEmail,
  sendWeeklyInsightsEmail,
} = require('../utils/email');
const { generateContent, hasGeminiApiKey } = require('./geminiService');

// Configurable warning threshold (fraction of the limit). Defaults to 80%.
// Never breaks: any invalid value falls back to 0.8.
const WARNING_THRESHOLD = (() => {
  const v = Number(process.env.BUDGET_WARNING_THRESHOLD);
  return Number.isFinite(v) && v > 0 && v <= 1 ? v : 0.8;
})();

// ── Dedup helpers ─────────────────────────────────────────────────────────────
// email_events has UNIQUE(user_id, event_key). claim = atomic "first writer wins".
// We claim BEFORE sending so concurrent triggers can't double-send, and release
// the claim if the send fails so a later trigger can retry.

async function claimEmailEvent(userId, eventKey) {
  try {
    const [result] = await pool.query(
      'INSERT IGNORE INTO email_events (user_id, event_key) VALUES (?, ?)',
      [userId, eventKey],
    );
    return result.affectedRows > 0;
  } catch (err) {
    // On any DB error, do NOT send — avoids accidental spamming.
    console.error('[email] claimEmailEvent failed:', err.message);
    return false;
  }
}

async function releaseEmailEvent(userId, eventKey) {
  try {
    await pool.query('DELETE FROM email_events WHERE user_id = ? AND event_key = ?', [userId, eventKey]);
  } catch (err) {
    console.error('[email] releaseEmailEvent failed:', err.message);
  }
}

/**
 * Send `sendFn()` at most once per (user, eventKey). When `force` is true the
 * dedup is bypassed (used by explicit "email me now" endpoints). Never throws.
 * @returns {Promise<{ sent: boolean, reason?: string }>}
 */
async function sendOnce(userId, eventKey, sendFn, { force = false } = {}) {
  if (!force) {
    const claimed = await claimEmailEvent(userId, eventKey);
    if (!claimed) return { sent: false, reason: 'already_sent' };
  }
  try {
    await sendFn();
    return { sent: true };
  } catch (err) {
    console.error(`[email] send failed for ${eventKey}:`, err.message);
    if (!force) await releaseEmailEvent(userId, eventKey);
    return { sent: false, reason: 'send_error' };
  }
}

// ── Date helpers ──────────────────────────────────────────────────────────────

function monthKeyOf(date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
}

function monthLabelOf(date) {
  return date.toLocaleString('en-US', { month: 'long', year: 'numeric' });
}

function isoWeekKey(date) {
  const d = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()));
  const dayNum = d.getUTCDay() || 7;
  d.setUTCDate(d.getUTCDate() + 4 - dayNum);
  const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
  const weekNo = Math.ceil((((d - yearStart) / 86400000) + 1) / 7);
  return `${d.getUTCFullYear()}-W${String(weekNo).padStart(2, '0')}`;
}

// ── Budget threshold emails ───────────────────────────────────────────────────

/**
 * Check the user's current-month budgets and send warning / exceeded emails.
 * Fire-and-forget safe: swallows all errors so it can never break an API call.
 * Warning fires at >= WARNING_THRESHOLD (default 80%); exceeded fires above 100%.
 * Each budget sends at most one warning and one exceeded email per month.
 */
async function checkAndSendBudgetEmails(userId) {
  try {
    const [users] = await pool.query(
      'SELECT email, full_name FROM users WHERE id = ? LIMIT 1',
      [userId],
    );
    if (!users.length || !users[0].email || users[0].email === DEMO_EMAIL) return;
    const { email, full_name } = users[0];

    const now = new Date();
    const monthKey = monthKeyOf(now);
    const monthLabel = monthLabelOf(now);

    // All budgets defined for the current month (overall = category_id IS NULL).
    // "spent" mirrors the dashboard: sum of expense-type transactions.
    const [budgets] = await pool.query(
      `SELECT
         b.id,
         b.category_id,
         b.amount_limit,
         COALESCE(c.name, 'Overall') AS label,
         COALESCE((
           SELECT SUM(e.amount) FROM expenses e
           WHERE e.user_id = b.user_id
             AND e.transaction_type = 'expense'
             AND (b.category_id IS NULL OR e.category_id = b.category_id)
             AND MONTH(e.expense_date) = MONTH(CURDATE())
             AND YEAR(e.expense_date) = YEAR(CURDATE())
         ), 0) AS spent
       FROM budgets b
       LEFT JOIN categories c ON c.id = b.category_id
       WHERE b.user_id = ?
         AND b.month = DATE_FORMAT(CURDATE(), '%Y-%m-01')`,
      [userId],
    );

    for (const b of budgets) {
      const limit = Number(b.amount_limit);
      if (!limit || limit <= 0) continue;
      const spent = Number(b.spent);
      const usage = spent / limit;
      const usagePct = Math.round(usage * 100);
      const payload = { userName: full_name, label: b.label, spent, limit, usagePct, monthLabel };

      if (usage > 1) {
        await sendOnce(userId, `budget_exceeded:${b.id}:${monthKey}`, () =>
          sendBudgetExceededEmail(email, payload));
      } else if (usage >= WARNING_THRESHOLD) {
        await sendOnce(userId, `budget_warning:${b.id}:${monthKey}`, () =>
          sendBudgetWarningEmail(email, payload));
      }
    }
  } catch (err) {
    console.error('[email] checkAndSendBudgetEmails failed:', err.message);
  }
}

// ── Monthly report ────────────────────────────────────────────────────────────

async function buildMonthlyReport(userId, year, month) {
  const [[income]] = await pool.query(
    `SELECT COALESCE(SUM(amount), 0) AS v FROM expenses
     WHERE user_id = ? AND transaction_type = 'income'
       AND MONTH(expense_date) = ? AND YEAR(expense_date) = ?`,
    [userId, month, year],
  );
  const [[expense]] = await pool.query(
    `SELECT COALESCE(SUM(amount), 0) AS v FROM expenses
     WHERE user_id = ? AND transaction_type = 'expense'
       AND MONTH(expense_date) = ? AND YEAR(expense_date) = ?`,
    [userId, month, year],
  );
  const [[top]] = await pool.query(
    `SELECT c.name AS name, COALESCE(SUM(e.amount), 0) AS amount
     FROM expenses e JOIN categories c ON c.id = e.category_id
     WHERE e.user_id = ? AND e.transaction_type = 'expense'
       AND MONTH(e.expense_date) = ? AND YEAR(e.expense_date) = ?
     GROUP BY c.id, c.name
     ORDER BY amount DESC
     LIMIT 1`,
    [userId, month, year],
  );

  const incomeVal = Number(income.v);
  const expenseVal = Number(expense.v);

  // Overall budget status for that month
  const monthStart = `${year}-${String(month).padStart(2, '0')}-01`;
  const [[budget]] = await pool.query(
    `SELECT amount_limit FROM budgets
     WHERE user_id = ? AND category_id IS NULL AND month = ? LIMIT 1`,
    [userId, monthStart],
  );

  let budgetStatus = 'No overall budget set';
  if (budget) {
    const limit = Number(budget.amount_limit);
    budgetStatus = expenseVal > limit
      ? `Over budget by ₹${Math.round(expenseVal - limit).toLocaleString('en-IN')} (limit ₹${Math.round(limit).toLocaleString('en-IN')})`
      : `Within budget — ₹${Math.round(expenseVal).toLocaleString('en-IN')} of ₹${Math.round(limit).toLocaleString('en-IN')}`;
  }

  return {
    income: incomeVal,
    expenses: expenseVal,
    savings: incomeVal - expenseVal,
    topCategory: top ? { name: top.name, amount: Number(top.amount) } : null,
    budgetStatus,
    hasActivity: incomeVal > 0 || expenseVal > 0,
  };
}

/**
 * Send the monthly spending report for the previous (most recently completed)
 * month to all real users. Intended to be triggered by a scheduler on the 1st.
 * @param {{ force?: boolean, targetUserId?: number|null }} opts
 */
async function sendMonthlyReportsToAllUsers({ force = false, targetUserId = null } = {}) {
  const summary = { processed: 0, sent: 0, skipped: 0, errors: 0 };
  try {
    const now = new Date();
    const prev = new Date(now.getFullYear(), now.getMonth() - 1, 1);
    const year = prev.getFullYear();
    const month = prev.getMonth() + 1;
    const monthKey = monthKeyOf(prev);
    const monthLabel = monthLabelOf(prev);

    const [users] = targetUserId
      ? await pool.query('SELECT id, email, full_name FROM users WHERE id = ? LIMIT 1', [targetUserId])
      : await pool.query('SELECT id, email, full_name FROM users WHERE email <> ?', [DEMO_EMAIL]);

    for (const user of users) {
      summary.processed++;
      if (!user.email || user.email === DEMO_EMAIL) { summary.skipped++; continue; }
      try {
        const report = await buildMonthlyReport(user.id, year, month);
        if (!report.hasActivity && !force) { summary.skipped++; continue; }

        const result = await sendOnce(user.id, `monthly_report:${monthKey}`, () =>
          sendMonthlyReportEmail(user.email, {
            userName: user.full_name,
            monthLabel,
            income: report.income,
            expenses: report.expenses,
            savings: report.savings,
            topCategory: report.topCategory,
            budgetStatus: report.budgetStatus,
          }), { force });

        if (result.sent) summary.sent++;
        else summary.skipped++;
      } catch (err) {
        summary.errors++;
        console.error(`[email] monthly report failed for user ${user.id}:`, err.message);
      }
    }
  } catch (err) {
    console.error('[email] sendMonthlyReportsToAllUsers failed:', err.message);
  }
  return summary;
}

// ── AI weekly insights ────────────────────────────────────────────────────────

async function buildWeeklyContext(userId) {
  const [[thisWeek]] = await pool.query(
    `SELECT COALESCE(SUM(amount), 0) AS total, COUNT(*) AS cnt FROM expenses
     WHERE user_id = ? AND transaction_type = 'expense'
       AND expense_date >= DATE_SUB(CURDATE(), INTERVAL 7 DAY)`,
    [userId],
  );
  const [[prevWeek]] = await pool.query(
    `SELECT COALESCE(SUM(amount), 0) AS total FROM expenses
     WHERE user_id = ? AND transaction_type = 'expense'
       AND expense_date >= DATE_SUB(CURDATE(), INTERVAL 14 DAY)
       AND expense_date <  DATE_SUB(CURDATE(), INTERVAL 7 DAY)`,
    [userId],
  );
  const [topCategories] = await pool.query(
    `SELECT c.name AS category, COALESCE(SUM(e.amount), 0) AS total
     FROM expenses e JOIN categories c ON c.id = e.category_id
     WHERE e.user_id = ? AND e.transaction_type = 'expense'
       AND e.expense_date >= DATE_SUB(CURDATE(), INTERVAL 7 DAY)
     GROUP BY c.id, c.name
     ORDER BY total DESC
     LIMIT 5`,
    [userId],
  );
  const [[biggest]] = await pool.query(
    `SELECT c.name AS category, e.amount, e.note
     FROM expenses e JOIN categories c ON c.id = e.category_id
     WHERE e.user_id = ? AND e.transaction_type = 'expense'
       AND e.expense_date >= DATE_SUB(CURDATE(), INTERVAL 7 DAY)
     ORDER BY e.amount DESC
     LIMIT 1`,
    [userId],
  );

  return {
    thisWeekTotal: Number(thisWeek.total),
    transactionCount: Number(thisWeek.cnt),
    prevWeekTotal: Number(prevWeek.total),
    topCategories: topCategories.map((r) => ({ category: r.category, amount: Number(r.total) })),
    biggest: biggest ? { category: biggest.category, amount: Number(biggest.amount), note: biggest.note } : null,
  };
}

function inr(n) {
  return '₹' + Math.round(Number(n) || 0).toLocaleString('en-IN');
}

/** Deterministic fallback insights when Gemini is unavailable or fails. */
function ruleBasedInsights(ctx) {
  const diff = ctx.thisWeekTotal - ctx.prevWeekTotal;
  let trend = '';
  if (ctx.prevWeekTotal > 0) {
    const pct = Math.round((diff / ctx.prevWeekTotal) * 100);
    trend = diff >= 0
      ? ` That's ${pct}% more than the week before.`
      : ` That's ${Math.abs(pct)}% less than the week before — nice.`;
  }
  const summary = `You spent ${inr(ctx.thisWeekTotal)} across ${ctx.transactionCount} transaction${ctx.transactionCount === 1 ? '' : 's'} in the past week.${trend}`;

  const insights = [];
  if (ctx.topCategories[0]) {
    insights.push(`Your biggest category was ${ctx.topCategories[0].category} at ${inr(ctx.topCategories[0].amount)}.`);
  }
  if (ctx.biggest) {
    insights.push(`Largest single expense: ${inr(ctx.biggest.amount)} in ${ctx.biggest.category}.`);
  }
  if (ctx.prevWeekTotal > 0 && diff > 0) {
    insights.push(`Spending rose by ${inr(diff)} versus the previous week.`);
  }

  const tips = [];
  if (ctx.topCategories[0]) {
    tips.push(`Trimming ${ctx.topCategories[0].category} by 15% would save about ${inr(ctx.topCategories[0].amount * 0.15)} next week.`);
  }
  tips.push('Set a weekly cap for discretionary categories to keep spending predictable.');

  return { summary, insights, tips };
}

async function generateWeeklyInsights(ctx) {
  if (!hasGeminiApiKey()) return ruleBasedInsights(ctx);

  const prompt = `You are SpendWise AI, a personal finance assistant for Indian users (currency INR ₹).
Using ONLY the weekly spending data below, write a short, friendly weekly insights summary.
Do NOT invent transactions or numbers not present in the data.

Return ONLY valid JSON in exactly this shape:
{"summary":"<=2 sentences","insights":["<=3 short bullet strings"],"tips":["<=3 short actionable saving tips"]}

Weekly data (JSON):
${JSON.stringify(ctx)}`;

  try {
    const res = await generateContent({
      prompt,
      temperature: 0.35,
      maxOutputTokens: 400,
      responseMimeType: 'application/json',
    });
    const j = res.ok ? res.json : null;
    if (j && typeof j.summary === 'string' && j.summary.trim()) {
      return {
        summary: String(j.summary).trim(),
        insights: Array.isArray(j.insights) ? j.insights.map(String).slice(0, 3) : [],
        tips: Array.isArray(j.tips) ? j.tips.map(String).slice(0, 3) : [],
      };
    }
  } catch (err) {
    console.error('[email] weekly insight generation failed:', err.message);
  }
  return ruleBasedInsights(ctx);
}

/**
 * Send AI weekly insights emails to all real users who had spending this week.
 * @param {{ force?: boolean, targetUserId?: number|null }} opts
 */
async function sendWeeklyInsightsToAllUsers({ force = false, targetUserId = null } = {}) {
  const summary = { processed: 0, sent: 0, skipped: 0, errors: 0 };
  try {
    const now = new Date();
    const weekKey = isoWeekKey(now);
    const weekLabel = `week of ${now.toLocaleDateString('en-US', { day: 'numeric', month: 'long' })}`;

    const [users] = targetUserId
      ? await pool.query('SELECT id, email, full_name FROM users WHERE id = ? LIMIT 1', [targetUserId])
      : await pool.query('SELECT id, email, full_name FROM users WHERE email <> ?', [DEMO_EMAIL]);

    for (const user of users) {
      summary.processed++;
      if (!user.email || user.email === DEMO_EMAIL) { summary.skipped++; continue; }
      try {
        const ctx = await buildWeeklyContext(user.id);
        if (ctx.thisWeekTotal <= 0 && !force) { summary.skipped++; continue; }

        const insights = await generateWeeklyInsights(ctx);
        const result = await sendOnce(user.id, `weekly_insights:${weekKey}`, () =>
          sendWeeklyInsightsEmail(user.email, {
            userName: user.full_name,
            weekLabel,
            summary: insights.summary,
            insights: insights.insights,
            tips: insights.tips,
          }), { force });

        if (result.sent) summary.sent++;
        else summary.skipped++;
      } catch (err) {
        summary.errors++;
        console.error(`[email] weekly insights failed for user ${user.id}:`, err.message);
      }
    }
  } catch (err) {
    console.error('[email] sendWeeklyInsightsToAllUsers failed:', err.message);
  }
  return summary;
}

module.exports = {
  checkAndSendBudgetEmails,
  sendMonthlyReportsToAllUsers,
  sendWeeklyInsightsToAllUsers,
  WARNING_THRESHOLD,
};
