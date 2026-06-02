const pool = require('../config/db');

const getDashboardSummary = async (req, res) => {
  try {
    const userId = req.user.id;

    const [[totals]] = await pool.query(
      `SELECT
        COALESCE(SUM(amount), 0) AS total_spending,
        COUNT(*) AS total_expenses
      FROM expenses
      WHERE user_id = ?`,
      [userId]
    );

    const [[currentMonth]] = await pool.query(
      `SELECT
        COALESCE(SUM(amount), 0) AS current_month_spending,
        COUNT(*) AS current_month_expenses
      FROM expenses
      WHERE user_id = ?
        AND MONTH(expense_date) = MONTH(CURDATE())
        AND YEAR(expense_date) = YEAR(CURDATE())`,
      [userId]
    );

    const [[budget]] = await pool.query(
      `SELECT amount_limit
      FROM budgets
      WHERE user_id = ?
        AND category_id IS NULL
        AND month = DATE_FORMAT(CURDATE(), '%Y-%m-01')
      LIMIT 1`,
      [userId]
    );

    const monthlyBudget = budget ? Number(budget.amount_limit) : null;
    const currentMonthSpending = Number(currentMonth.current_month_spending);
    const budgetRemaining =
      monthlyBudget !== null ? monthlyBudget - currentMonthSpending : null;

    res.json({
      success: true,
      summary: {
        total_spending: Number(totals.total_spending),
        total_expenses: totals.total_expenses,
        current_month_spending: currentMonthSpending,
        current_month_expenses: currentMonth.current_month_expenses,
        monthly_budget: monthlyBudget,
        budget_remaining: budgetRemaining,
      },
    });
  } catch (err) {
    res.status(500).json({
      success: false,
      message: err.message,
    });
  }
};

const getCategoryBreakdown = async (req, res) => {
  try {
    const userId = req.user.id;

    const [rows] = await pool.query(
      `SELECT
        c.id AS category_id,
        c.name AS category_name,
        COALESCE(SUM(e.amount), 0) AS total_amount
      FROM categories c
      LEFT JOIN expenses e
        ON e.category_id = c.id
        AND e.user_id = ?
        AND MONTH(e.expense_date) = MONTH(CURDATE())
        AND YEAR(e.expense_date) = YEAR(CURDATE())
      WHERE c.user_id = ?
      GROUP BY c.id, c.name
      HAVING total_amount > 0
      ORDER BY total_amount DESC`,
      [userId, userId]
    );

    const total = rows.reduce((sum, row) => sum + Number(row.total_amount), 0);

    const breakdown = rows.map((row) => ({
      category_id: row.category_id,
      category_name: row.category_name,
      total_amount: Number(row.total_amount),
      percentage: total > 0 ? Number(((row.total_amount / total) * 100).toFixed(2)) : 0,
    }));

    res.json({
      success: true,
      labels: breakdown.map((item) => item.category_name),
      values: breakdown.map((item) => item.total_amount),
      breakdown,
    });
  } catch (err) {
    res.status(500).json({
      success: false,
      message: err.message,
    });
  }
};

const getMonthlyTrend = async (req, res) => {
  try {
    const userId = req.user.id;

    const [rows] = await pool.query(
      `SELECT
        DATE_FORMAT(expense_date, '%Y-%m') AS month,
        COALESCE(SUM(amount), 0) AS total_amount
      FROM expenses
      WHERE user_id = ?
        AND expense_date >= DATE_SUB(CURDATE(), INTERVAL 6 MONTH)
      GROUP BY DATE_FORMAT(expense_date, '%Y-%m')
      ORDER BY month ASC`,
      [userId]
    );

    res.json({
      success: true,
      labels: rows.map((row) => row.month),
      values: rows.map((row) => Number(row.total_amount)),
      trend: rows.map((row) => ({
        month: row.month,
        total_amount: Number(row.total_amount),
      })),
    });
  } catch (err) {
    res.status(500).json({
      success: false,
      message: err.message,
    });
  }
};

const getTopSpendingCategory = async (req, res) => {
  try {
    const userId = req.user.id;

    const [rows] = await pool.query(
      `SELECT
        c.id AS category_id,
        c.name AS category_name,
        COALESCE(SUM(e.amount), 0) AS total_amount
      FROM expenses e
      JOIN categories c ON c.id = e.category_id
      WHERE e.user_id = ?
        AND MONTH(e.expense_date) = MONTH(CURDATE())
        AND YEAR(e.expense_date) = YEAR(CURDATE())
      GROUP BY c.id, c.name
      ORDER BY total_amount DESC
      LIMIT 1`,
      [userId]
    );

    if (rows.length === 0) {
      return res.json({
        success: true,
        top_category: null,
        message: 'No spending data for current month',
      });
    }

    res.json({
      success: true,
      top_category: {
        category_id: rows[0].category_id,
        category_name: rows[0].category_name,
        total_amount: Number(rows[0].total_amount),
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
  getDashboardSummary,
  getCategoryBreakdown,
  getMonthlyTrend,
  getTopSpendingCategory,
};
