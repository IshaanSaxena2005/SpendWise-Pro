const pool = require('../config/db');

const preferenceDefaults = {
  budgetAlerts: true,
  overspendingWarnings: true,
  aiForecasts: true,
  emailReports: false,
};

function toPreferences(row) {
  return {
    budgetAlerts: Boolean(row.budget_alerts),
    overspendingWarnings: Boolean(row.overspending_warnings),
    aiForecasts: Boolean(row.ai_forecasts),
    emailReports: Boolean(row.email_reports),
  };
}

async function getPreferences(req, res) {
  try {
    await pool.query(
      `INSERT INTO user_notification_preferences (user_id)
       VALUES (?) ON DUPLICATE KEY UPDATE user_id = VALUES(user_id)`,
      [req.user.id],
    );
    const [rows] = await pool.query(
      'SELECT budget_alerts, overspending_warnings, ai_forecasts, email_reports FROM user_notification_preferences WHERE user_id = ?',
      [req.user.id],
    );
    return res.json({ success: true, preferences: rows.length ? toPreferences(rows[0]) : preferenceDefaults });
  } catch (err) {
    return res.status(500).json({ success: false, message: err.message });
  }
}

async function updatePreferences(req, res) {
  try {
    const { budgetAlerts, overspendingWarnings, aiForecasts, emailReports } = req.body;
    const values = { budgetAlerts, overspendingWarnings, aiForecasts, emailReports };
    if (Object.values(values).some((value) => typeof value !== 'boolean')) {
      return res.status(400).json({ success: false, message: 'All notification preferences must be boolean values.' });
    }
    await pool.query(
      `INSERT INTO user_notification_preferences
        (user_id, budget_alerts, overspending_warnings, ai_forecasts, email_reports)
       VALUES (?, ?, ?, ?, ?)
       ON DUPLICATE KEY UPDATE
         budget_alerts = VALUES(budget_alerts),
         overspending_warnings = VALUES(overspending_warnings),
         ai_forecasts = VALUES(ai_forecasts),
         email_reports = VALUES(email_reports)`,
      [req.user.id, budgetAlerts, overspendingWarnings, aiForecasts, emailReports],
    );
    return res.json({ success: true, preferences: values });
  } catch (err) {
    return res.status(500).json({ success: false, message: err.message });
  }
}

const getNotifications = async (req, res) => {
  try {
    const userId = req.user.id;
    const [rows] = await pool.query('SELECT * FROM notifications WHERE user_id = ? ORDER BY created_at DESC', [userId]);
    const notifications = rows.map(row => ({
      ...row,
      read: row.read_status
    }));
    res.json({ success: true, data: notifications });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

const markAsRead = async (req, res) => {
  try {
    const userId = req.user.id;
    const { id } = req.params;
    await pool.query('UPDATE notifications SET read_status = TRUE WHERE id = ? AND user_id = ?', [id, userId]);
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

const markAllAsRead = async (req, res) => {
  try {
    const userId = req.user.id;
    await pool.query('UPDATE notifications SET read_status = TRUE WHERE user_id = ?', [userId]);
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

module.exports = {
  getNotifications,
  markAsRead,
  markAllAsRead,
  getPreferences,
  updatePreferences,
};
