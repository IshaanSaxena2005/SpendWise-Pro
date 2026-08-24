const pool = require('../config/db');
const { checkAnomaly } = require('../services/anomalyService');
const { DEMO_EMAIL } = require('../config/constants');
const { learnFromUserChoice } = require('../services/learningService');
const { checkAndSendBudgetEmails } = require('../services/emailNotificationService');

const addExpense = async (req, res) => {
  try {
    if (req.user.email === DEMO_EMAIL) {
      return res.status(403).json({
        success: false,
        message: 'Demo mode is read-only. Create your own account to manage personal finances.'
      });
    }

    const userId = req.user.id;
    const { category_id, amount, expense_date, note, title, is_recurring, recurring_transaction_id, goal_id, transaction_type } = req.body;
    const expenseNote = note && note.trim() ? note : (title || '');
    const txnType = transaction_type === 'income' ? 'income' : 'expense';

    await pool.query(
      'INSERT INTO expenses (user_id, category_id, amount, expense_date, note, is_recurring, recurring_transaction_id, goal_id, transaction_type) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)',
      [userId, category_id, amount, expense_date, expenseNote, is_recurring || false, recurring_transaction_id || null, goal_id || null, txnType]
    );

    const merchantName = title || note || '';
    if (merchantName) {
      await learnFromUserChoice(userId, merchantName, category_id);
    }

    const anomaly = await checkAnomaly(userId, amount, category_id);
    if (anomaly.is_anomaly) {
      const [categories] = await pool.query(
        'SELECT name FROM categories WHERE id = ?',
        [category_id]
      );
      const categoryName = categories[0]?.name || 'Unknown';
      await pool.query(
        `INSERT INTO notifications (user_id, title, description, type, read_status) 
         VALUES (?, ?, ?, 'anomaly', FALSE)`,
        [
          userId,
          'Unusual spending detected',
          `Your transaction of ₹${amount} in ${categoryName} is unusually high.`
        ]
      );
    }

    res.json({
      success: true,
      message: 'Expense added',
      is_anomaly: anomaly.is_anomaly
    });

    // Fire-and-forget: budget threshold emails must never block or break the API.
    // The service self-catches all errors; the extra .catch() is belt-and-suspenders.
    checkAndSendBudgetEmails(userId).catch(() => {});
  } catch (err) {
    res.status(500).json({
      success: false,
      message: err.message,
    });
  }
};

const getExpenses = async (req, res) => {
  try {
    const userId = req.user.id;

    const [expenses] = await pool.query(
      `SELECT
        e.id,
        e.user_id,
        e.category_id,
        c.name AS category_name,
        e.amount,
        e.expense_date,
        e.note,
        e.is_recurring,
        e.recurring_transaction_id,
        e.goal_id,
        g.name AS goal_title,
        e.transaction_type,
        e.created_at,
        e.updated_at
      FROM expenses e
      JOIN categories c ON c.id = e.category_id
      LEFT JOIN goals g ON g.id = e.goal_id
      WHERE e.user_id = ?
      ORDER BY e.expense_date DESC, e.id DESC`,
      [userId]
    );

    res.json({
      success: true,
      expenses,
    });
  } catch (err) {
    res.status(500).json({
      success: false,
      message: err.message,
    });
  }
};

const updateExpense = async (req, res) => {
  try {
    if (req.user.email === DEMO_EMAIL) {
      return res.status(403).json({
        success: false,
        message: 'Demo mode is read-only. Create your own account to manage personal finances.'
      });
    }

    const userId = req.user.id;
    const { id } = req.params;
    const { amount, category_id, expense_date, note, title, goal_id, transaction_type, is_recurring, recurring_transaction_id } = req.body;
    const expenseNote = note || title;

    const fields = ['amount = ?', 'category_id = ?', 'expense_date = ?', 'note = ?'];
    const params = [amount, category_id, expense_date, expenseNote];

    if (goal_id !== undefined) {
      fields.push('goal_id = ?');
      params.push(goal_id || null);
    }

    if (transaction_type !== undefined) {
      fields.push('transaction_type = ?');
      params.push(transaction_type === 'income' ? 'income' : 'expense');
    }

    if (is_recurring !== undefined) {
      fields.push('is_recurring = ?');
      params.push(Boolean(is_recurring));
    }

    if (recurring_transaction_id !== undefined) {
      fields.push('recurring_transaction_id = ?');
      params.push(recurring_transaction_id || null);
    }

    params.push(id, userId);

    const [result] = await pool.query(
      `UPDATE expenses SET ${fields.join(', ')} WHERE id = ? AND user_id = ?`,
      params
    );

    if (result.affectedRows === 0) {
      return res.status(404).json({
        success: false,
        message: 'Expense not found',
      });
    }

    const merchantName = title || note || '';
    if (merchantName) {
      await learnFromUserChoice(userId, merchantName, category_id);
    }

    res.json({
      success: true,
      message: 'Expense updated',
    });

    // Fire-and-forget: recompute budget usage and send threshold emails if crossed.
    checkAndSendBudgetEmails(userId).catch(() => {});
  } catch (err) {
    res.status(500).json({
      success: false,
      message: err.message,
    });
  }
};

const deleteExpense = async (req, res) => {
  try {
    if (req.user.email === DEMO_EMAIL) {
      return res.status(403).json({
        success: false,
        message: 'Demo mode is read-only. Create your own account to manage personal finances.'
      });
    }

    const userId = req.user.id;
    const { id } = req.params;

    const [result] = await pool.query(
      'DELETE FROM expenses WHERE id = ? AND user_id = ?',
      [id, userId]
    );

    if (result.affectedRows === 0) {
      return res.status(404).json({
        success: false,
        message: 'Expense not found',
      });
    }

    res.json({
      success: true,
      message: 'Expense deleted',
    });

    // Fire-and-forget: recalculate budget usage after deletion.
    // No new threshold emails will be sent for already-reached thresholds
    // because email_events deduplication prevents duplicate sends.
    checkAndSendBudgetEmails(userId).catch(() => {});
  } catch (err) {
    res.status(500).json({
      success: false,
      message: err.message,
    });
  }
};

module.exports = {
  addExpense,
  getExpenses,
  updateExpense,
  deleteExpense,
};
