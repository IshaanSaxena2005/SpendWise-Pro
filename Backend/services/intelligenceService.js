const pool = require('../config/db');

/**
 * Helper to calculate start and end dates for months
 */
const getMonthRange = (date) => {
  const start = new Date(date.getFullYear(), date.getMonth(), 1);
  const end = new Date(date.getFullYear(), date.getMonth() + 1, 0, 23, 59, 59);
  return { start, end };
};

/**
 * Generate insights, recommendations, and notifications based on real data
 */
const generateIntelligence = async (userId) => {
  let connection;
  try {
    connection = await pool.getConnection();
    await connection.beginTransaction();

    // 1. Fetch raw data
    const [categories] = await connection.query('SELECT * FROM categories WHERE user_id = ?', [userId]);
    const [expenses] = await connection.query('SELECT * FROM expenses WHERE user_id = ? ORDER BY expense_date DESC', [userId]);
    const [budgets] = await connection.query('SELECT * FROM budgets WHERE user_id = ?', [userId]);

    // Clear old dynamically generated insights and recommendations (we want fresh ones)
    await connection.query('DELETE FROM ai_insights WHERE user_id = ?', [userId]);
    await connection.query('DELETE FROM recommendations WHERE user_id = ?', [userId]);

    const now = new Date();
    const currentMonth = getMonthRange(now);
    
    const lastMonthDate = new Date(now);
    lastMonthDate.setMonth(lastMonthDate.getMonth() - 1);
    const lastMonth = getMonthRange(lastMonthDate);

    // Helpers to aggregate spending
    const getSpending = (start, end) => {
      return expenses.filter(e => {
        const d = new Date(e.expense_date);
        return d >= start && d <= end;
      });
    };

    const currentMonthExpenses = getSpending(currentMonth.start, currentMonth.end);
    const lastMonthExpenses = getSpending(lastMonth.start, lastMonth.end);

    const getCategoryTotal = (expArray, catId) => {
      return expArray.filter(e => e.category_id === catId).reduce((sum, e) => sum + parseFloat(e.amount), 0);
    };

    // --- A. BUDGET RISK DETECTION ---
    for (const budget of budgets) {
      const budgetMonthStr = budget.month; // e.g., '2026-06-01'
      const budgetDate = new Date(budgetMonthStr);
      
      // Only check budgets for the current month
      if (budgetDate.getFullYear() === now.getFullYear() && budgetDate.getMonth() === now.getMonth()) {
        const spent = getCategoryTotal(currentMonthExpenses, budget.category_id);
        const limit = parseFloat(budget.amount_limit);
        const usage = spent / limit;
        const categoryName = categories.find(c => c.id === budget.category_id)?.name || 'Unknown';

        const daysRemaining = currentMonth.end.getDate() - now.getDate();

        if (usage > 0.95) {
          // Critical Risk
          await insertInsight(connection, userId, 'Critical Budget Risk', `${categoryName} budget is ${(usage * 100).toFixed(0)}% consumed with ${daysRemaining} days remaining.`, 'High', 0.95, categoryName);
          await insertNotification(connection, userId, 'Critical Budget Alert', `You have used ${(usage * 100).toFixed(0)}% of your ${categoryName} budget.`, 'alert');
        } else if (usage > 0.80) {
          // Warning Risk
          await insertInsight(connection, userId, 'Budget Risk Detection', `${categoryName} budget is ${(usage * 100).toFixed(0)}% consumed with ${daysRemaining} days remaining.`, 'Medium', 0.88, categoryName);
          await insertNotification(connection, userId, 'Budget Warning', `You have used ${(usage * 100).toFixed(0)}% of your ${categoryName} budget.`, 'warning');
        }
      }
    }

    // --- B. SPENDING TRENDS & SAVINGS OPPORTUNITIES ---
    for (const cat of categories) {
      const currentTotal = getCategoryTotal(currentMonthExpenses, cat.id);
      const lastTotal = getCategoryTotal(lastMonthExpenses, cat.id);

      if (lastTotal > 0) {
        const increaseRatio = (currentTotal - lastTotal) / lastTotal;
        
        if (increaseRatio > 0.20) { // 20% increase
          const increasePct = (increaseRatio * 100).toFixed(0);
          await insertInsight(connection, userId, 'Spending Increase Detection', `${cat.name} spending increased by ${increasePct}% compared to last month.`, 'Medium', 0.90, cat.name);
          
          // Recommendation
          const potentialSavings = (currentTotal * 0.15).toFixed(2);
          await insertRecommendation(connection, userId, 'Savings Opportunity', `Reducing ${cat.name} expenses by 15% could save ₹${potentialSavings} this month.`, 8.5, cat.name);
        } else if (increaseRatio < -0.10) {
          await insertInsight(connection, userId, 'Category Trends', `${cat.name} expenses have decreased recently. Keep it up!`, 'Low', 0.85, cat.name);
        }
      }
    }

    // --- C. ANOMALY DETECTION (Isolation Forest logic simulation using Z-Score) ---
    if (expenses.length > 5) {
      const amounts = expenses.map(e => parseFloat(e.amount));
      const mean = amounts.reduce((a, b) => a + b, 0) / amounts.length;
      const stdDev = Math.sqrt(amounts.map(x => Math.pow(x - mean, 2)).reduce((a, b) => a + b, 0) / amounts.length);

      // Check last 7 days for anomalies
      const sevenDaysAgo = new Date();
      sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);
      
      const recentExpenses = expenses.filter(e => new Date(e.expense_date) >= sevenDaysAgo);
      for (const exp of recentExpenses) {
        const amt = parseFloat(exp.amount);
        if (amt > mean + 2.5 * stdDev) {
          const catName = categories.find(c => c.id === exp.category_id)?.name || 'Unknown';
          
          // Check if we already notified about this exact anomaly
          const [existing] = await connection.query(`SELECT id FROM notifications WHERE user_id = ? AND title = 'Anomaly Detected' AND description LIKE ?`, [userId, `%₹${amt}%`]);
          
          if (existing.length === 0) {
            await insertNotification(connection, userId, 'Anomaly Detected', `Unusual spending flagged: ₹${amt} in ${catName}.`, 'alert');
            await insertInsight(connection, userId, 'Unusual Transaction', `A remarkably high transaction of ₹${amt} was detected in ${catName}.`, 'High', 0.92, catName);
          }
        }
      }
    }

    // --- D. FORECAST WARNINGS ---
    const daysPassed = now.getDate();
    const daysInMonth = currentMonth.end.getDate();
    const currentTotalSpent = currentMonthExpenses.reduce((sum, e) => sum + parseFloat(e.amount), 0);
    
    if (daysPassed > 5 && currentTotalSpent > 0) {
      const runRate = currentTotalSpent / daysPassed;
      const forecastedTotal = runRate * daysInMonth;
      const lastMonthTotalSpent = lastMonthExpenses.reduce((sum, e) => sum + parseFloat(e.amount), 0);
      
      if (lastMonthTotalSpent > 0 && forecastedTotal > lastMonthTotalSpent * 1.15) {
        await insertInsight(connection, userId, 'Forecast Warnings', `Current trend suggests spending may reach ₹${forecastedTotal.toFixed(0)} this month, exceeding last month's average.`, 'High', 0.85, 'Overall');
        await insertRecommendation(connection, userId, 'Adjust Spending Pace', `You are spending 15% faster than last month. Slow down discretionary spending to stay on track.`, 7.0, 'Overall');
        
        // Notification (if not already sent recently)
        const [existing] = await connection.query(`SELECT id FROM notifications WHERE user_id = ? AND title = 'Forecast Alert' AND DATE(created_at) = CURDATE()`, [userId]);
        if (existing.length === 0) {
          await insertNotification(connection, userId, 'Forecast Alert', `Predicted spending exceeds average. Estimated: ₹${forecastedTotal.toFixed(0)}`, 'warning');
        }
      }
    }

    await connection.commit();
    return true;
  } catch (error) {
    if (connection) await connection.rollback();
    console.error('Error generating intelligence:', error);
    throw error;
  } finally {
    if (connection) connection.release();
  }
};

// Helper inserts
const insertInsight = async (connection, userId, title, desc, severity, confidence, category) => {
  await connection.query(
    'INSERT INTO ai_insights (user_id, title, description, severity, confidence_score, category) VALUES (?, ?, ?, ?, ?, ?)',
    [userId, title, desc, severity, confidence, category]
  );
};

const insertRecommendation = async (connection, userId, title, desc, impact, category) => {
  await connection.query(
    'INSERT INTO recommendations (user_id, title, description, impact_score, category) VALUES (?, ?, ?, ?, ?)',
    [userId, title, desc, impact, category]
  );
};

const insertNotification = async (connection, userId, title, desc, type) => {
  await connection.query(
    'INSERT INTO notifications (user_id, title, description, type) VALUES (?, ?, ?, ?)',
    [userId, title, desc, type]
  );
};

module.exports = {
  generateIntelligence,
};
