const crypto = require('crypto');
const pool = require('../config/db');
const { DEMO_EMAIL } = require('../config/constants');

// Token validity: 7 days
const TOKEN_EXPIRY_DAYS = 7;

/**
 * Generate a secure random token
 */
function generateToken() {
  return crypto.randomBytes(32).toString('hex');
}

/**
 * Create a report token for a user
 * @param {number} userId
 * @param {string} reportType - e.g., 'monthly_report'
 * @param {string} reportMonth - e.g., '2024-01-01'
 * @returns {Promise<string>} - The generated token
 */
async function createReportToken(userId, reportType, reportMonth) {
  const token = generateToken();
  const expiresAt = new Date(Date.now() + TOKEN_EXPIRY_DAYS * 24 * 60 * 60 * 1000);
  
  // Clean up old tokens for this user and report type
  await pool.query(
    'DELETE FROM report_tokens WHERE user_id = ? AND report_type = ? AND report_month = ?',
    [userId, reportType, reportMonth]
  );
  
  await pool.query(
    'INSERT INTO report_tokens (user_id, token, report_type, report_month, expires_at) VALUES (?, ?, ?, ?, ?)',
    [userId, token, reportType, reportMonth, expiresAt]
  );
  
  return token;
}

/**
 * Validate a report token and return the associated user_id
 * @param {string} token
 * @returns {Promise<{userId: number, reportType: string, reportMonth: string} | null>}
 */
async function validateReportToken(token) {
  const [rows] = await pool.query(
    `SELECT user_id, report_type, report_month 
     FROM report_tokens 
     WHERE token = ? AND expires_at > NOW()`,
    [token]
  );
  
  if (rows.length === 0) {
    return null;
  }
  
  return {
    userId: rows[0].user_id,
    reportType: rows[0].report_type,
    reportMonth: rows[0].report_month
  };
}

/**
 * Generate monthly report CSV content for a user
 * @param {number} userId
 * @param {number} year
 * @param {number} month
 * @returns {Promise<string>} - CSV content
 */
async function generateMonthlyReportCSV(userId, year, month) {
  // Get transactions for the month
  const [transactions] = await pool.query(
    `SELECT 
       e.id,
       e.expense_date,
       e.amount,
       e.note,
       e.transaction_type,
       c.name AS category_name
     FROM expenses e
     JOIN categories c ON c.id = e.category_id
     WHERE e.user_id = ?
       AND MONTH(e.expense_date) = ?
       AND YEAR(e.expense_date) = ?
     ORDER BY e.expense_date DESC, e.id DESC`,
    [userId, month, year]
  );
  
  // Get summary stats
  const [incomeStats] = await pool.query(
    `SELECT COALESCE(SUM(amount), 0) AS total
     FROM expenses
     WHERE user_id = ? AND transaction_type = 'income'
       AND MONTH(expense_date) = ? AND YEAR(expense_date) = ?`,
    [userId, month, year]
  );
  
  const [expenseStats] = await pool.query(
    `SELECT COALESCE(SUM(amount), 0) AS total
     FROM expenses
     WHERE user_id = ? AND transaction_type = 'expense'
       AND MONTH(expense_date) = ? AND YEAR(expense_date) = ?`,
    [userId, month, year]
  );
  
  const [topCategory] = await pool.query(
    `SELECT c.name, SUM(e.amount) AS total
     FROM expenses e
     JOIN categories c ON c.id = e.category_id
     WHERE e.user_id = ? AND e.transaction_type = 'expense'
       AND MONTH(e.expense_date) = ? AND YEAR(e.expense_date) = ?
     GROUP BY c.id, c.name
     ORDER BY total DESC
     LIMIT 1`,
    [userId, month, year]
  );
  
  const income = Number(incomeStats[0]?.total || 0);
  const expenses = Number(expenseStats[0]?.total || 0);
  const savings = income - expenses;
  const topCat = topCategory[0] || null;
  
  // Build CSV content
  const monthName = new Date(year, month - 1).toLocaleString('en-US', { month: 'long', year: 'numeric' });
  
  let csv = 'Date,Description,Category,Amount,Type\n';
  transactions.forEach(t => {
    const date = new Date(t.expense_date).toLocaleDateString('en-IN');
    const note = (t.note || '').replace(/"/g, '""');
    const category = (t.category_name || '').replace(/"/g, '""');
    csv += `"${date}","${note}","${category}","${Number(t.amount)}","${t.transaction_type}"\n`;
  });
  
  // Add summary section
  csv += '\n\nSummary\n';
  csv += `"Month","${monthName}"\n`;
  csv += `"Total Income","${income}"\n`;
  csv += `"Total Expenses","${expenses}"\n`;
  csv += `"Net Savings","${savings}"\n`;
  csv += `"Total Transactions","${transactions.length}"\n`;
  if (topCat) {
    csv += `"Top Category","${topCat.name}"\n`;
    csv += `"Top Category Amount","${Number(topCat.total)}"\n`;
  }
  
  return csv;
}

/**
 * GET /api/reports/monthly/:token
 * Download monthly report using secure token
 */
async function downloadMonthlyReport(req, res) {
  try {
    const { token } = req.params;
    
    // Validate token
    const tokenData = await validateReportToken(token);
    if (!tokenData) {
      return res.status(401).json({
        success: false,
        message: 'Invalid or expired report link. Please request a new report.'
      });
    }
    
    // Parse report month (format: YYYY-MM-DD)
    const [yearStr, monthStr] = tokenData.reportMonth.split('-');
    const year = parseInt(yearStr, 10);
    const month = parseInt(monthStr, 10);
    
    if (!year || !month || month < 1 || month > 12) {
      return res.status(400).json({
        success: false,
        message: 'Invalid report period'
      });
    }
    
    // Generate CSV report
    const csv = await generateMonthlyReportCSV(tokenData.userId, year, month);
    const monthName = new Date(year, month - 1).toLocaleString('en-US', { month: 'long', year: 'numeric' });
    
    // Set headers for CSV download
    res.setHeader('Content-Type', 'text/csv');
    res.setHeader('Content-Disposition', `attachment; filename="SpendWise_Report_${monthName.replace(' ', '_')}.csv"`);
    
    return res.send(csv);
  } catch (err) {
    console.error('[report] downloadMonthlyReport failed:', err.message);
    return res.status(500).json({
      success: false,
      message: 'Failed to generate report'
    });
  }
}

/**
 * POST /api/reports/generate-token
 * Generate a secure token for monthly report download
 */
async function generateReportToken(req, res) {
  try {
    const userId = req.user.id;
    const { year, month } = req.body;
    
    if (!year || !month || month < 1 || month > 12) {
      return res.status(400).json({
        success: false,
        message: 'Invalid year or month'
      });
    }
    
    // Format month as first day of month for storage
    const reportMonth = `${year}-${String(month).padStart(2, '0')}-01`;
    
    // Generate token
    const token = await createReportToken(userId, 'monthly_report', reportMonth);
    
    return res.json({
      success: true,
      token,
      expiresDays: TOKEN_EXPIRY_DAYS
    });
  } catch (err) {
    console.error('[report] generateReportToken failed:', err.message);
    return res.status(500).json({
      success: false,
      message: 'Failed to generate report token'
    });
  }
}

module.exports = {
  downloadMonthlyReport,
  generateReportToken,
  createReportToken,
  validateReportToken,
  generateMonthlyReportCSV
};
