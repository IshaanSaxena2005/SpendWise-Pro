const pool = require('../config/db');
const axios = require('axios');
const { getAnomalyHistory } = require('./anomalyService');

const SUPPORTED_QUERIES = {
  'How much did I spend this month?': 'getThisMonthSpending',
  'What is my top spending category?': 'getTopSpendingCategory',
  'Which category needs attention?': 'getCategoryNeedingAttention',
  'Am I overspending?': 'checkOverspending',
  'How can I save money?': 'getSavingsTips',
  'Predict next month\'s expenses': 'predictNextMonthExpenses',
  'Predict next month\'s expenses.': 'predictNextMonthExpenses',
  'What is my expense forecast?': 'predictNextMonthExpenses',
  'Will I spend more next month?': 'predictNextMonthExpenses',
  'What is my financial health score?': 'getFinancialHealthScore',
  'Show budget status.': 'showBudgetStatus',
  'Compare this month vs last month.': 'compareThisVsLastMonth',
  'What is my name?': 'getProfileName',
  'What is my email?': 'getProfileEmail',
  'What is my role?': 'getProfileRole',
  'When did I join?': 'getProfileJoinDate',
  'Do I have an avatar?': 'checkAvatar',
  'Did I make any unusual transactions?': 'getAnomalies',
  'Show anomalous spending.': 'getAnomalies',
  'Was my recent spending abnormal?': 'getAnomalies',
  'Any suspicious expenses?': 'getAnomalies',
};

async function getThisMonthSpending(userId) {
  const [[currentMonth]] = await pool.query(
    `SELECT
      COALESCE(SUM(e.amount), 0) AS current_month_spending
    FROM expenses e
    JOIN categories c ON c.id = e.category_id
    WHERE e.user_id = ?
      AND c.name NOT IN ('Salary', 'Freelance')
      AND MONTH(e.expense_date) = MONTH(CURDATE())
      AND YEAR(e.expense_date) = YEAR(CURDATE())`,
    [userId]
  );
  return `You have spent ₹${Number(currentMonth.current_month_spending).toFixed(2)} this month.`;
}

async function getTopSpendingCategory(userId) {
  const [rows] = await pool.query(
    `SELECT
      c.name AS category_name,
      COALESCE(SUM(e.amount), 0) AS total_amount
    FROM expenses e
    JOIN categories c ON c.id = e.category_id
    WHERE e.user_id = ?
      AND c.name NOT IN ('Salary', 'Freelance')
      AND MONTH(e.expense_date) = MONTH(CURDATE())
      AND YEAR(e.expense_date) = YEAR(CURDATE())
    GROUP BY c.id, c.name
    ORDER BY total_amount DESC
    LIMIT 1`,
    [userId]
  );

  if (rows.length === 0) {
    return "You don't have any spending data yet.";
  }

  return `Your top spending category this month is **${rows[0].category_name}** with ₹${Number(rows[0].total_amount).toFixed(2)}.`;
}

async function getCategoryNeedingAttention(userId) {
  const [budgets] = await pool.query(
    `SELECT 
      c.name, 
      b.amount_limit, 
      COALESCE(SUM(e.amount), 0) AS spent
    FROM budgets b
    JOIN categories c ON b.category_id = c.id
    LEFT JOIN expenses e ON b.category_id = e.category_id 
      AND e.expense_date BETWEEN b.month AND LAST_DAY(b.month)
      AND e.user_id = ?
    WHERE b.user_id = ? 
      AND b.category_id IS NOT NULL
      AND b.month = DATE_FORMAT(CURDATE(), '%Y-%m-01')
    GROUP BY b.id
    ORDER BY (spent / b.amount_limit) DESC
    LIMIT 1`,
    [userId, userId]
  );

  const budget = budgets[0];
  return budget 
    ? `Your **${budget.name}** budget needs attention. You've spent ₹${Number(budget.spent).toFixed(2)} against a limit of ₹${Number(budget.amount_limit).toFixed(2)}.`
    : "No budget needs attention right now.";
}

async function checkOverspending(userId) {
  const [[currentMonth]] = await pool.query(
    `SELECT
      COALESCE(SUM(e.amount), 0) AS current_month_spending
    FROM expenses e
    JOIN categories c ON c.id = e.category_id
    WHERE e.user_id = ?
      AND c.name NOT IN ('Salary', 'Freelance')
      AND MONTH(e.expense_date) = MONTH(CURDATE())
      AND YEAR(e.expense_date) = YEAR(CURDATE())`,
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

  const currentMonthSpending = Number(currentMonth.current_month_spending);
  const monthlyBudget = budget ? Number(budget.amount_limit) : null;

  if (monthlyBudget !== null) {
    const usage = currentMonthSpending / monthlyBudget;
    return usage > 1 
      ? `Yes, you are overspending. You've spent ₹${currentMonthSpending.toFixed(2)} against your total budget of ₹${monthlyBudget.toFixed(2)}.`
      : `No, you are not overspending. You've spent ₹${currentMonthSpending.toFixed(2)} against your total budget of ₹${monthlyBudget.toFixed(2)}.`;
  }
  return "You don't have a budget set up yet.";
}

async function getSavingsTips(userId) {
  const [recommendations] = await pool.query(
    'SELECT * FROM recommendations WHERE user_id = ? ORDER BY impact_score DESC LIMIT 3',
    [userId]
  );
  if (recommendations.length > 0) {
    const tips = recommendations.map((rec, index) => `${index + 1}. **${rec.title}**: ${rec.description}`).join('\n');
    return `Here are some savings tips:\n${tips}`;
  }
  return "Start tracking your expenses and set budgets to find savings opportunities!";
}

async function predictNextMonthExpenses(userId) {
  const [rows] = await pool.query(
    `SELECT DATE_FORMAT(expense_date, '%Y-%m') as month,
            SUM(amount) as total
     FROM expenses
     WHERE user_id = ?
     GROUP BY month
     ORDER BY month ASC`,
    [userId]
  );

  const history = rows.map(row => Number(row.total));

  if (history.length < 3) {
    return "Not enough historical data for prediction.";
  }

  const mlServiceUrl = process.env.ML_SERVICE_URL;
  if (!mlServiceUrl) {
    return "ML service is not configured.";
  }

  try {
    const flaskResponse = await axios.post(
      `${mlServiceUrl.replace(/\/$/, '')}/forecast`,
      { history: history }
    );

    const predicted = flaskResponse.data.predicted_spending;
    const trend = flaskResponse.data.trend_direction;
    return `Based on your spending history, I predict your expenses next month will be around ₹${Number(predicted).toFixed(2)}. The trend is ${trend.toLowerCase()}.`;
  } catch {
    return "Sorry, I couldn't generate a prediction right now.";
  }
}

async function getFinancialHealthScore(userId) {
  const [score] = await pool.query('SELECT score FROM financial_health WHERE user_id = ? ORDER BY created_at DESC LIMIT 1', [userId]);
  if (score.length > 0) {
    return `Your financial health score is **${score[0].score}** out of 100.`;
  }
  return "Generate your financial health insights to see your score!";
}

async function showBudgetStatus(userId) {
  const [budgets] = await pool.query(
    `SELECT
      c.name,
      b.amount_limit,
      COALESCE(SUM(e.amount), 0) AS spent
    FROM budgets b
    LEFT JOIN categories c ON b.category_id = c.id
    LEFT JOIN expenses e ON b.category_id = e.category_id 
      AND e.expense_date BETWEEN b.month AND LAST_DAY(b.month)
      AND e.user_id = ?
    WHERE b.user_id = ? 
      AND b.month = DATE_FORMAT(CURDATE(), '%Y-%m-01')
    GROUP BY b.id`,
    [userId, userId]
  );

  if (budgets.length > 0) {
    const status = budgets.map(b => `- **${b.name || 'Overall'}**: ₹${Number(b.spent).toFixed(2)} / ₹${Number(b.amount_limit).toFixed(2)}`).join('\n');
    return `Here is your budget status for this month:\n${status}`;
  }
  return "You don't have any budgets set up yet.";
}

async function compareThisVsLastMonth(userId) {
  const [[thisMonth]] = await pool.query(
    `SELECT
      COALESCE(SUM(e.amount), 0) AS total
    FROM expenses e
    JOIN categories c ON c.id = e.category_id
    WHERE e.user_id = ?
      AND c.name NOT IN ('Salary', 'Freelance')
      AND MONTH(e.expense_date) = MONTH(CURDATE())
      AND YEAR(e.expense_date) = YEAR(CURDATE())`,
    [userId]
  );

  const [[lastMonth]] = await pool.query(
    `SELECT
      COALESCE(SUM(e.amount), 0) AS total
    FROM expenses e
    JOIN categories c ON c.id = e.category_id
    WHERE e.user_id = ?
      AND c.name NOT IN ('Salary', 'Freelance')
      AND MONTH(e.expense_date) = MONTH(CURDATE() - INTERVAL 1 MONTH)
      AND YEAR(e.expense_date) = YEAR(CURDATE() - INTERVAL 1 MONTH)`,
    [userId]
  );

  const thisTotal = Number(thisMonth.total);
  const lastTotal = Number(lastMonth.total);
  const diff = thisTotal - lastTotal;
  return `This month: ₹${thisTotal.toFixed(2)}\nLast month: ₹${lastTotal.toFixed(2)}\nDifference: ${diff > 0 ? '+' : ''}₹${diff.toFixed(2)} (${diff > 0 ? 'increase' : 'decrease'})`;
}

async function getProfileName(userId) {
  const [user] = await pool.query('SELECT full_name FROM users WHERE id = ?', [userId]);
  return user.length > 0 ? `Your name is **${user[0].full_name}**.` : "User not found.";
}

async function getProfileEmail(userId) {
  const [user] = await pool.query('SELECT email FROM users WHERE id = ?', [userId]);
  return user.length > 0 ? `Your email is **${user[0].email}**.` : "User not found.";
}

async function getProfileRole(_userId) {
  return "Your role is **User**.";
}

async function getProfileJoinDate(userId) {
  const [user] = await pool.query('SELECT created_at FROM users WHERE id = ?', [userId]);
  return user.length > 0 ? `You joined on **${new Date(user[0].created_at).toLocaleDateString()}**.` : "User not found.";
}

async function checkAvatar(userId) {
  const [avatar] = await pool.query('SELECT * FROM profile_photos WHERE user_id = ?', [userId]);
  return avatar.length > 0 ? "Yes, you have an avatar set up." : "No, you don't have an avatar yet.";
}

async function getAnomalies(userId) {
  const anomalies = await getAnomalyHistory(userId);
  if (!anomalies || anomalies.length === 0) return "No unusual transactions were detected.";
  const lines = anomalies.slice(0, 3).map(anomaly => 
    `- ${anomaly.description} (${new Date(anomaly.created_at).toLocaleDateString()})`
  );
  return `Here are your recent unusual transactions:\n${lines.join('\n')}`;
}

async function handleAIChat(userId, userQuery) {
  const normalizedQuery = userQuery.trim().toLowerCase();
  let matchedHandler = null;
  for (const [query, handlerName] of Object.entries(SUPPORTED_QUERIES)) {
    if (normalizedQuery.includes(query.toLowerCase())) {
      matchedHandler = handlerName;
      break;
    }
  }
  if (!matchedHandler) {
    return "I'm SpendWise AI and can assist only with your financial data, spending analytics, predictions, and profile information.";
  }
  const handlers = {
    getThisMonthSpending,
    getTopSpendingCategory,
    getCategoryNeedingAttention,
    checkOverspending,
    getSavingsTips,
    predictNextMonthExpenses,
    getFinancialHealthScore,
    showBudgetStatus,
    compareThisVsLastMonth,
    getProfileName,
    getProfileEmail,
    getProfileRole,
    getProfileJoinDate,
    checkAvatar,
    getAnomalies,
  };
  return await handlers[matchedHandler](userId);
}

module.exports = {
  handleAIChat,
  SUPPORTED_QUERIES,
};
