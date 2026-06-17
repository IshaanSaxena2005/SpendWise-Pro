const pool = require('../config/db');

// ──────────────────────────────────────────────
// Helpers
// ──────────────────────────────────────────────

/**
 * Return the first day of the month that is `offset` months before today.
 * offset = 0 → current month, offset = 1 → previous month, etc.
 */
function monthStart(offset = 0) {
  const d = new Date();
  d.setMonth(d.getMonth() - offset);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-01`;
}

function clamp(value, min = 0, max = 1) {
  return Math.min(max, Math.max(min, value));
}

function getRating(score) {
  if (score >= 80) return 'Excellent';
  if (score >= 60) return 'Good';
  if (score >= 40) return 'Average';
  return 'Poor';
}

// ──────────────────────────────────────────────
// Factor 1 — Budget Adherence  (max 40 pts)
// How well actual spending stays within budgets
// over the last 3 months.
// ──────────────────────────────────────────────
async function calcBudgetAdherence(userId) {
  const threeMonthsAgo = monthStart(2);

  const [rows] = await pool.query(
    `SELECT
       b.month,
       b.category_id,
       b.amount_limit,
       COALESCE(SUM(e.amount), 0) AS total_spent
     FROM budgets b
     LEFT JOIN expenses e
       ON  e.user_id    = b.user_id
       AND e.category_id = b.category_id
       AND DATE_FORMAT(e.expense_date, '%Y-%m-01') = b.month
     WHERE b.user_id = ?
       AND b.month >= ?
     GROUP BY b.id, b.month, b.category_id, b.amount_limit`,
    [userId, threeMonthsAgo]
  );

  if (rows.length === 0) {
    // No budgets set → give a neutral mid-score and recommend creating budgets
    return {
      score: 20,
      detail: 'No budgets found for the last 3 months.',
      recommendation: 'Start setting monthly budgets to track your spending limits.',
    };
  }

  // For each budget, ratio = spent / limit.  Perfect = 1.0, over-budget > 1.
  // Per-budget score: 1 when ratio ≤ 1, linear drop toward 0 as ratio → 2+.
  let totalWeight = 0;
  let weightedScore = 0;

  for (const r of rows) {
    const limit = Number(r.amount_limit);
    const spent = Number(r.total_spent);
    const ratio = limit > 0 ? spent / limit : 0;
    const budgetScore = clamp(1 - Math.max(0, ratio - 1)); // 1 if ≤100%, 0 if ≥200%
    weightedScore += budgetScore * limit; // weight by budget size
    totalWeight += limit;
  }

  const normalized = totalWeight > 0 ? weightedScore / totalWeight : 0;
  const score = Math.round(normalized * 40);

  const overBudgetCount = rows.filter(
    (r) => Number(r.total_spent) > Number(r.amount_limit)
  ).length;

  let recommendation = 'Great job staying within your budgets!';
  if (overBudgetCount > 0) {
    recommendation = `You exceeded ${overBudgetCount} budget(s) recently. Review those categories and adjust spending or limits.`;
  }

  return {
    score,
    detail: `${rows.length} budget(s) evaluated, ${overBudgetCount} over-budget.`,
    recommendation,
  };
}

// ──────────────────────────────────────────────
// Factor 2 — Spending Consistency  (max 30 pts)
// Low variance in monthly totals = more predictable finances.
// ──────────────────────────────────────────────
async function calcSpendingConsistency(userId) {
  const threeMonthsAgo = monthStart(2);

  const [rows] = await pool.query(
    `SELECT
       DATE_FORMAT(expense_date, '%Y-%m') AS ym,
       SUM(amount) AS monthly_total
     FROM expenses
     WHERE user_id = ?
       AND expense_date >= ?
     GROUP BY ym
     ORDER BY ym`,
    [userId, threeMonthsAgo]
  );

  if (rows.length <= 1) {
    return {
      score: 15,
      detail: 'Not enough monthly data to evaluate consistency.',
      recommendation: 'Keep logging expenses every month so we can analyse spending trends.',
    };
  }

  const totals = rows.map((r) => Number(r.monthly_total));
  const mean = totals.reduce((a, b) => a + b, 0) / totals.length;
  const variance =
    totals.reduce((sum, v) => sum + (v - mean) ** 2, 0) / totals.length;
  const cv = mean > 0 ? Math.sqrt(variance) / mean : 0; // coefficient of variation

  // cv = 0 → perfectly consistent, cv ≥ 1 → very erratic
  const normalized = clamp(1 - cv);
  const score = Math.round(normalized * 30);

  let recommendation = 'Your spending is very consistent — excellent discipline!';
  if (cv > 0.5) {
    recommendation =
      'Your monthly spending varies significantly. Try to stabilise recurring expenses.';
  } else if (cv > 0.25) {
    recommendation =
      'Moderate variation in spending detected. Small adjustments can improve consistency.';
  }

  return {
    score,
    detail: `Coefficient of variation: ${cv.toFixed(2)} across ${totals.length} month(s).`,
    recommendation,
  };
}

// ──────────────────────────────────────────────
// Factor 3 — Category Balance  (max 20 pts)
// A well-diversified spend across categories is healthier
// than dumping everything into one bucket.
// ──────────────────────────────────────────────
async function calcCategoryBalance(userId) {
  const threeMonthsAgo = monthStart(2);

  const [rows] = await pool.query(
    `SELECT
       c.name AS category_name,
       SUM(e.amount) AS cat_total
     FROM expenses e
     JOIN categories c ON c.id = e.category_id
     WHERE e.user_id = ?
       AND e.expense_date >= ?
     GROUP BY e.category_id, c.name`,
    [userId, threeMonthsAgo]
  );

  if (rows.length === 0) {
    return {
      score: 10,
      detail: 'No categorised expenses found.',
      recommendation: 'Start logging expenses with categories to get a balance analysis.',
    };
  }

  if (rows.length === 1) {
    return {
      score: 5,
      detail: 'All spending in a single category.',
      recommendation:
        'Diversify your expense tracking — add categories like Savings, Food, Transport, etc.',
    };
  }

  // Shannon entropy normalised by log(n)
  const grandTotal = rows.reduce((s, r) => s + Number(r.cat_total), 0);
  const probabilities = rows.map((r) => Number(r.cat_total) / grandTotal);
  const entropy = -probabilities.reduce(
    (s, p) => s + (p > 0 ? p * Math.log(p) : 0),
    0
  );
  const maxEntropy = Math.log(rows.length);
  const normalized = maxEntropy > 0 ? entropy / maxEntropy : 0;
  const score = Math.round(normalized * 20);

  const dominant = rows.reduce((max, r) =>
    Number(r.cat_total) > Number(max.cat_total) ? r : max
  );
  const dominantPct = ((Number(dominant.cat_total) / grandTotal) * 100).toFixed(1);

  let recommendation = 'Good spread across categories!';
  if (normalized < 0.5) {
    recommendation = `"${dominant.category_name}" dominates at ${dominantPct}% of spending. Try to balance across categories.`;
  } else if (normalized < 0.75) {
    recommendation = `Spending is moderately balanced. "${dominant.category_name}" leads at ${dominantPct}%.`;
  }

  return {
    score,
    detail: `${rows.length} categories, entropy ratio: ${normalized.toFixed(2)}.`,
    recommendation,
  };
}

// ──────────────────────────────────────────────
// Factor 4 — Expense Activity  (max 10 pts)
// Regular logging shows financial discipline.
// ──────────────────────────────────────────────
async function calcExpenseActivity(userId) {
  const thirtyDaysAgo = new Date();
  thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
  const since = thirtyDaysAgo.toISOString().slice(0, 10);

  const [rows] = await pool.query(
    `SELECT COUNT(*) AS cnt,
            COUNT(DISTINCT expense_date) AS active_days
     FROM expenses
     WHERE user_id = ?
       AND expense_date >= ?`,
    [userId, since]
  );

  const { cnt, active_days: activeDays } = rows[0];
  const count = Number(cnt);
  const days = Number(activeDays);

  // Scoring: at least 10 entries in 30 days and at least 8 distinct days → full marks
  const entryScore = clamp(count / 10);
  const dayScore = clamp(days / 8);
  const combined = (entryScore + dayScore) / 2;
  const score = Math.round(combined * 10);

  let recommendation = 'You are actively tracking expenses — keep it up!';
  if (count === 0) {
    recommendation = 'No expenses recorded in the last 30 days. Start tracking to improve your score.';
  } else if (days < 4) {
    recommendation = 'Try to log expenses more regularly throughout the month.';
  }

  return {
    score,
    detail: `${count} expense(s) across ${days} active day(s) in the last 30 days.`,
    recommendation,
  };
}

// ──────────────────────────────────────────────
// Main endpoint handler
// ──────────────────────────────────────────────
const getHealthScore = async (req, res) => {
  try {
    const userId = req.user.id;

    // Run all four factors in parallel
    const [budgetAdherence, spendingConsistency, categoryBalance, expenseActivity] =
      await Promise.all([
        calcBudgetAdherence(userId),
        calcSpendingConsistency(userId),
        calcCategoryBalance(userId),
        calcExpenseActivity(userId),
      ]);

    const totalScore =
      budgetAdherence.score +
      spendingConsistency.score +
      categoryBalance.score +
      expenseActivity.score;

    const rating = getRating(totalScore);

    // Collect all recommendations (skip generic "great job" ones when score is max)
    const recommendations = [
      budgetAdherence.recommendation,
      spendingConsistency.recommendation,
      categoryBalance.recommendation,
      expenseActivity.recommendation,
    ];

    res.json({
      success: true,
      score: totalScore,
      rating,
      factors: {
        budgetAdherence: {
          score: budgetAdherence.score,
          maxScore: 40,
          detail: budgetAdherence.detail,
        },
        spendingConsistency: {
          score: spendingConsistency.score,
          maxScore: 30,
          detail: spendingConsistency.detail,
        },
        categoryBalance: {
          score: categoryBalance.score,
          maxScore: 20,
          detail: categoryBalance.detail,
        },
        expenseActivity: {
          score: expenseActivity.score,
          maxScore: 10,
          detail: expenseActivity.detail,
        },
      },
      recommendations,
    });
  } catch (err) {
    res.status(500).json({
      success: false,
      message: err.message,
    });
  }
};

module.exports = {
  getHealthScore,
};
