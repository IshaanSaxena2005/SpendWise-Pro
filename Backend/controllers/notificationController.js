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
    let rows;
    try {
      // Anomaly alerts are linked to their expense via notifications.expense_id
      // and must disappear with it. The FK (ON DELETE CASCADE) + the defensive
      // cleanup in deleteExpense delete linked rows, but PRE-FIX legacy anomaly
      // rows have expense_id = NULL (created before the link existed) and old
      // deployments without the migration have no column at all — those must
      // never resurface as active alerts in the bell.
      //
      // Fallback: if the migration is not applied (no expense_id column), every
      // type='anomaly' row is by definition an un-linkable legacy orphan, so
      // fall back to the raw read without failing the endpoint (the raw shape
      // is also what pre-migration code always returned).
      [rows] = await pool.query(
        `SELECT * FROM notifications n
         WHERE n.user_id = ?
           AND NOT (n.type = 'anomaly'
                    AND (n.expense_id IS NULL
                         OR NOT EXISTS (SELECT 1 FROM expenses e WHERE e.id = n.expense_id)))
         ORDER BY created_at DESC`,
        [userId]
      );
    } catch (schemaErr) {
      if (schemaErr && (schemaErr.code === 'ER_BAD_FIELD_ERROR' || /Unknown column/i.test(schemaErr.message || ''))) {
        [rows] = await pool.query(
          `SELECT * FROM notifications WHERE user_id = ? AND type <> 'anomaly' ORDER BY created_at DESC`,
          [userId]
        );
      } else {
        throw schemaErr;
      }
    }
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
