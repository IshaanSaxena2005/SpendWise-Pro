const pool = require('../config/db');
const { DEMO_EMAIL } = require('../config/constants');
const { calculateNextExecutionDate } = require('../services/recurringExecutionService');

const createRecurringTransaction = async (req, res) => {
  try {
    if (req.user.email === DEMO_EMAIL) {
      return res.status(403).json({
        success: false,
        message: 'Demo mode is read-only. Create your own account to manage personal finances.'
      });
    }

    const userId = req.user.id;
    const { type, amount, category_id, note, frequency, start_date, end_date, never_ends } = req.body;

    // Validate category exists if provided
    if (category_id) {
      const [categories] = await pool.query(
        'SELECT id FROM categories WHERE id = ? AND user_id = ?',
        [category_id, userId]
      );
      if (categories.length === 0) {
        return res.status(400).json({
          success: false,
          message: 'Invalid category',
        });
      }
    }

    // Calculate next execution date
    const nextExecutionDate = calculateNextExecutionDate(start_date, frequency);

    const [result] = await pool.query(
      `INSERT INTO recurring_transactions 
       (user_id, type, amount, category_id, note, frequency, start_date, end_date, next_execution_date, never_ends) 
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [userId, type, amount, category_id, note, frequency, start_date, end_date, nextExecutionDate, never_ends]
    );

    res.json({
      success: true,
      message: 'Recurring transaction created',
      id: result.insertId,
    });
  } catch (err) {
    res.status(500).json({
      success: false,
      message: err.message,
    });
  }
};

const getRecurringTransactions = async (req, res) => {
  try {
    const userId = req.user.id;

    const [recurring] = await pool.query(
      `SELECT
        rt.id,
        rt.user_id,
        rt.linked_transaction_id,
        rt.type,
        rt.amount,
        rt.category_id,
        c.name AS category_name,
        rt.note,
        rt.frequency,
        rt.start_date,
        rt.end_date,
        rt.next_execution_date,
        rt.never_ends,
        rt.is_active,
        rt.created_at,
        rt.updated_at
      FROM recurring_transactions rt
      LEFT JOIN categories c ON c.id = rt.category_id
      WHERE rt.user_id = ?
      ORDER BY rt.created_at DESC`,
      [userId]
    );

    res.json({
      success: true,
      recurring_transactions: recurring,
    });
  } catch (err) {
    res.status(500).json({
      success: false,
      message: err.message,
    });
  }
};

const updateRecurringTransaction = async (req, res) => {
  try {
    if (req.user.email === DEMO_EMAIL) {
      return res.status(403).json({
        success: false,
        message: 'Demo mode is read-only. Create your own account to manage personal finances.'
      });
    }

    const userId = req.user.id;
    const { id } = req.params;
    const { amount, category_id, note, frequency, start_date, end_date, never_ends, is_active } = req.body;

    // Validate category exists if provided
    if (category_id) {
      const [categories] = await pool.query(
        'SELECT id FROM categories WHERE id = ? AND user_id = ?',
        [category_id, userId]
      );
      if (categories.length === 0) {
        return res.status(400).json({
          success: false,
          message: 'Invalid category',
        });
      }
    }

    // Recalculate next execution date if frequency or start_date changed
    let nextExecutionDate;
    if (frequency || start_date) {
      const [current] = await pool.query(
        'SELECT frequency, start_date FROM recurring_transactions WHERE id = ? AND user_id = ?',
        [id, userId]
      );
      if (current.length > 0) {
        const newFrequency = frequency || current[0].frequency;
        const newStartDate = start_date || current[0].start_date;
        nextExecutionDate = calculateNextExecutionDate(newStartDate, newFrequency);
      }
    }

    const [result] = await pool.query(
      `UPDATE recurring_transactions 
       SET amount = ?, category_id = ?, note = ?, frequency = ?, start_date = ?, end_date = ?, never_ends = ?, is_active = ?, next_execution_date = ?, updated_at = CURRENT_TIMESTAMP
       WHERE id = ? AND user_id = ?`,
      [amount, category_id, note, frequency, start_date, end_date, never_ends, is_active, nextExecutionDate, id, userId]
    );

    if (result.affectedRows === 0) {
      return res.status(404).json({
        success: false,
        message: 'Recurring transaction not found',
      });
    }

    res.json({
      success: true,
      message: 'Recurring transaction updated',
    });
  } catch (err) {
    res.status(500).json({
      success: false,
      message: err.message,
    });
  }
};

const deleteRecurringTransaction = async (req, res) => {
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
      'DELETE FROM recurring_transactions WHERE id = ? AND user_id = ?',
      [id, userId]
    );

    if (result.affectedRows === 0) {
      return res.status(404).json({
        success: false,
        message: 'Recurring transaction not found',
      });
    }

    res.json({
      success: true,
      message: 'Recurring transaction deleted',
    });
  } catch (err) {
    res.status(500).json({
      success: false,
      message: err.message,
    });
  }
};

const pauseRecurringTransaction = async (req, res) => {
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
      'UPDATE recurring_transactions SET is_active = FALSE WHERE id = ? AND user_id = ?',
      [id, userId]
    );

    if (result.affectedRows === 0) {
      return res.status(404).json({
        success: false,
        message: 'Recurring transaction not found',
      });
    }

    res.json({
      success: true,
      message: 'Recurring transaction paused',
    });
  } catch (err) {
    res.status(500).json({
      success: false,
      message: err.message,
    });
  }
};

const resumeRecurringTransaction = async (req, res) => {
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
      'UPDATE recurring_transactions SET is_active = TRUE WHERE id = ? AND user_id = ?',
      [id, userId]
    );

    if (result.affectedRows === 0) {
      return res.status(404).json({
        success: false,
        message: 'Recurring transaction not found',
      });
    }

    res.json({
      success: true,
      message: 'Recurring transaction resumed',
    });
  } catch (err) {
    res.status(500).json({
      success: false,
      message: err.message,
    });
  }
};

module.exports = {
  createRecurringTransaction,
  getRecurringTransactions,
  updateRecurringTransaction,
  deleteRecurringTransaction,
  pauseRecurringTransaction,
  resumeRecurringTransaction,
};
