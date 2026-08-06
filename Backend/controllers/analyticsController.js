const pool = require('../config/db');

const getDashboardSummary = async (req, res) => {
  try {
    const userId = req.user.id;
    console.log(`[getDashboardSummary] userId: ${userId}`);

    const [[totals]] = await pool.query(
      `SELECT
        COALESCE(SUM(e.amount), 0) AS total_spending,
        COUNT(*) AS total_expenses
      FROM expenses e
      WHERE e.user_id = ?
        AND e.transaction_type = 'expense'`,
      [userId]
    );
    console.log(`[getDashboardSummary] totals query result:`, totals);

    const [[currentMonth]] = await pool.query(
      `SELECT
        COALESCE(SUM(e.amount), 0) AS current_month_spending,
        COUNT(*) AS current_month_expenses
      FROM expenses e
      WHERE e.user_id = ?
        AND e.transaction_type = 'expense'
        AND MONTH(e.expense_date) = MONTH(CURDATE())
        AND YEAR(e.expense_date) = YEAR(CURDATE())`,
      [userId]
    );
    console.log(`[getDashboardSummary] currentMonth query result:`, currentMonth);

    const [[currentMonthIncome]] = await pool.query(
      `SELECT
        COALESCE(SUM(e.amount), 0) AS current_month_income
      FROM expenses e
      WHERE e.user_id = ?
        AND e.transaction_type = 'income'
        AND MONTH(e.expense_date) = MONTH(CURDATE())
        AND YEAR(e.expense_date) = YEAR(CURDATE())`,
      [userId]
    );
    console.log(`[getDashboardSummary] currentMonthIncome query result:`, currentMonthIncome);

    const [[budget]] = await pool.query(
      `SELECT amount_limit
      FROM budgets
      WHERE user_id = ?
        AND category_id IS NULL
        AND month = DATE_FORMAT(CURDATE(), '%Y-%m-01')
      LIMIT 1`,
      [userId]
    );
    console.log(`[getDashboardSummary] budget query result:`, budget);

    const monthlyBudget = budget ? Number(budget.amount_limit) : null;
    const currentMonthSpending = Number(currentMonth.current_month_spending);
    const currentMonthIncomeValue = Number(currentMonthIncome.current_month_income);
    const currentMonthBalance = currentMonthIncomeValue - currentMonthSpending;
    const budgetRemaining =
      monthlyBudget !== null ? monthlyBudget - currentMonthSpending : null;

    const response = {
      success: true,
      summary: {
        total_spending: Number(totals.total_spending),
        total_expenses: totals.total_expenses,
        current_month_spending: currentMonthSpending,
        current_month_expenses: currentMonth.current_month_expenses,
        current_month_income: currentMonthIncomeValue,
        current_month_balance: currentMonthBalance,
        monthly_budget: monthlyBudget,
        budget_remaining: budgetRemaining,
      },
    };
    console.log(`[getDashboardSummary] JSON response:`, JSON.stringify(response, null, 2));
    res.json(response);
  } catch (err) {
    console.error(`[getDashboardSummary] Error:`, err);
    res.status(500).json({
      success: false,
      message: err.message,
    });
  }
};

const getCategoryBreakdown = async (req, res) => {
  try {
    const userId = req.user.id;
    console.log(`[getCategoryBreakdown] userId: ${userId}`);

    const [rows] = await pool.query(
      `SELECT
        c.id AS category_id,
        c.name AS category_name,
        COALESCE(SUM(e.amount), 0) AS total_amount
      FROM categories c
      LEFT JOIN expenses e
        ON e.category_id = c.id
        AND e.user_id = ?
        AND e.transaction_type = 'expense'
        AND MONTH(e.expense_date) = MONTH(CURDATE())
        AND YEAR(e.expense_date) = YEAR(CURDATE())
      WHERE c.user_id = ?
      GROUP BY c.id, c.name
      HAVING total_amount > 0
      ORDER BY total_amount DESC`,
      [userId, userId]
    );
    console.log(`[getCategoryBreakdown] SQL result count: ${rows.length}`);
    console.log(`[getCategoryBreakdown] SQL rows:`, rows);

    const total = rows.reduce((sum, row) => sum + Number(row.total_amount), 0);

    const breakdown = rows.map((row) => ({
      category_id: row.category_id,
      category_name: row.category_name,
      total_amount: Number(row.total_amount),
      percentage: total > 0 ? Number(((row.total_amount / total) * 100).toFixed(2)) : 0,
    }));

    const response = {
      success: true,
      labels: breakdown.map((item) => item.category_name),
      values: breakdown.map((item) => item.total_amount),
      breakdown,
    };
    console.log(`[getCategoryBreakdown] JSON response:`, JSON.stringify(response, null, 2));
    res.json(response);
  } catch (err) {
    console.error(`[getCategoryBreakdown] Error:`, err);
    res.status(500).json({
      success: false,
      message: err.message,
    });
  }
};

const getMonthlyTrend = async (req, res) => {
  try {
    const userId = req.user.id;
    console.log(`[getMonthlyTrend] userId: ${userId}`);
    console.log(`[getMonthlyTrend] Current date: ${new Date().toISOString()}`);

    const [rows] = await pool.query(
      `SELECT
        DATE_FORMAT(e.expense_date, '%Y-%m') AS month,
        COALESCE(SUM(e.amount), 0) AS total_amount
      FROM expenses e
      WHERE e.user_id = ?
        AND e.transaction_type = 'expense'
        AND e.expense_date >= DATE_SUB(CURDATE(), INTERVAL 6 MONTH)
      GROUP BY DATE_FORMAT(e.expense_date, '%Y-%m')
      ORDER BY month ASC`,
      [userId]
    );
    console.log(`[getMonthlyTrend] SQL result count: ${rows.length}`);
    console.log(`[getMonthlyTrend] SQL rows:`, rows);

    const response = {
      success: true,
      labels: rows.map((row) => row.month),
      values: rows.map((row) => Number(row.total_amount)),
      trend: rows.map((row) => ({
        month: row.month,
        total_amount: Number(row.total_amount),
      })),
    };
    console.log(`[getMonthlyTrend] JSON response:`, JSON.stringify(response, null, 2));
    res.json(response);
  } catch (err) {
    console.error(`[getMonthlyTrend] Error:`, err);
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
        AND e.transaction_type = 'expense'
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

const getFinancialHistory = async (req, res) => {
  try {
    const userId = req.user.id;

    // Fetch all user expenses/incomes
    const [expenses] = await pool.query(
      `SELECT
        e.id,
        e.category_id,
        c.name AS category_name,
        e.amount,
        e.expense_date,
        e.note,
        e.transaction_type
      FROM expenses e
      JOIN categories c ON c.id = e.category_id
      WHERE e.user_id = ?
      ORDER BY e.expense_date DESC, e.id DESC`,
      [userId]
    );

    // Fetch all monthly budgets (where category_id IS NULL)
    const [budgets] = await pool.query(
      `SELECT
        b.id,
        DATE_FORMAT(b.month, '%Y-%m-%d') AS month,
        b.amount_limit
      FROM budgets b
      WHERE b.user_id = ?
        AND b.category_id IS NULL
      ORDER BY b.month DESC`,
      [userId]
    );

    res.json({
      success: true,
      expenses,
      budgets,
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
  getFinancialHistory,
};
