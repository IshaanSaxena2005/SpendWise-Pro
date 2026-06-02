const pool = require('../config/db');

// ──────────────────────────────────────────────
// Helpers
// ──────────────────────────────────────────────

/**
 * Return the first day of the current month (YYYY-MM-01).
 */
function currentMonthStart() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-01`;
}

/**
 * Total days in the current month.
 */
function daysInCurrentMonth() {
  const d = new Date();
  return new Date(d.getFullYear(), d.getMonth() + 1, 0).getDate();
}

/**
 * Days elapsed in the current month (including today).
 */
function daysElapsed() {
  return new Date().getDate();
}

function getRisk(ratio) {
  // ratio = predictedSpending / budget
  if (ratio <= 1.0) return 'Low';
  if (ratio <= 1.25) return 'Medium';
  return 'High';
}

// ──────────────────────────────────────────────
// Main handler
// ──────────────────────────────────────────────
const getBudgetBreachPrediction = async (req, res) => {
  try {
    const userId = req.user.id;
    const monthStart = currentMonthStart();
    const totalDays = daysInCurrentMonth();
    const elapsed = daysElapsed();

    // ── 1. Current month spending (overall) ──
    const [spendRows] = await pool.query(
      `SELECT COALESCE(SUM(amount), 0) AS total_spent
       FROM expenses
       WHERE user_id = ?
         AND DATE_FORMAT(expense_date, '%Y-%m-01') = ?`,
      [userId, monthStart]
    );
    const currentSpending = Number(spendRows[0].total_spent);

    // ── 2. Current month budget (overall — category_id IS NULL) ──
    const [budgetRows] = await pool.query(
      `SELECT amount_limit
       FROM budgets
       WHERE user_id = ?
         AND month = ?
         AND category_id IS NULL`,
      [userId, monthStart]
    );

    if (budgetRows.length === 0) {
      return res.json({
        success: true,
        prediction: null,
        message:
          'No overall budget set for this month. Create one via POST /api/budgets/add to enable breach prediction.',
      });
    }

    const budget = Number(budgetRows[0].amount_limit);

    // ── 3. Predict month-end spending ──
    // Daily spending rate × total days in month
    const dailyRate = elapsed > 0 ? currentSpending / elapsed : 0;
    const predictedMonthEnd = Math.round(dailyRate * totalDays * 100) / 100;
    const expectedOverBudget =
      Math.round(Math.max(0, predictedMonthEnd - budget) * 100) / 100;

    const ratio = budget > 0 ? predictedMonthEnd / budget : 0;
    const risk = getRisk(ratio);

    // ── 4. Recommendation ──
    let recommendation;
    if (risk === 'Low') {
      recommendation =
        'You are on track to stay within your budget this month. Keep it up!';
    } else if (risk === 'Medium') {
      const remainingDays = totalDays - elapsed;
      const safeDailyBudget =
        remainingDays > 0
          ? ((budget - currentSpending) / remainingDays).toFixed(2)
          : '0.00';
      recommendation =
        `You are approaching your budget limit. ` +
        `Limit daily spending to ₹${safeDailyBudget} for the remaining ${remainingDays} day(s) to stay within budget.`;
    } else {
      const cutbackPct = Math.round((1 - 1 / ratio) * 100);
      recommendation =
        `You are projected to exceed your budget by ₹${expectedOverBudget}. ` +
        `Consider cutting spending by ~${cutbackPct}% or revising your budget upward.`;
    }

    // ── 5. Per-category breakdown (bonus detail) ──
    const [catRows] = await pool.query(
      `SELECT
         c.name        AS category_name,
         b.amount_limit AS category_budget,
         COALESCE(SUM(e.amount), 0) AS category_spent
       FROM budgets b
       JOIN categories c ON c.id = b.category_id
       LEFT JOIN expenses e
         ON  e.user_id     = b.user_id
         AND e.category_id = b.category_id
         AND DATE_FORMAT(e.expense_date, '%Y-%m-01') = b.month
       WHERE b.user_id = ?
         AND b.month   = ?
         AND b.category_id IS NOT NULL
       GROUP BY b.id, c.name, b.amount_limit`,
      [userId, monthStart]
    );

    const categoryBreakdown = catRows.map((r) => {
      const catBudget = Number(r.category_budget);
      const catSpent = Number(r.category_spent);
      const catPredicted =
        Math.round((elapsed > 0 ? catSpent / elapsed : 0) * totalDays * 100) / 100;
      const catOver = Math.round(Math.max(0, catPredicted - catBudget) * 100) / 100;
      const catRatio = catBudget > 0 ? catPredicted / catBudget : 0;

      return {
        category: r.category_name,
        budget: catBudget,
        current_spending: catSpent,
        predicted_month_end: catPredicted,
        expected_over_budget: catOver,
        risk: getRisk(catRatio),
      };
    });

    res.json({
      success: true,
      prediction: {
        month: monthStart,
        days_elapsed: elapsed,
        days_in_month: totalDays,
        current_spending: currentSpending,
        budget,
        daily_spending_rate: Math.round(dailyRate * 100) / 100,
        predicted_month_end_spending: predictedMonthEnd,
        expected_over_budget: expectedOverBudget,
        risk,
        recommendation,
        category_breakdown: categoryBreakdown,
      },
    });
  } catch (err) {
    res.status(500).json({
      success: false,
      message: err.message,
    });
  }
};

module.exports = {
  getBudgetBreachPrediction,
};
