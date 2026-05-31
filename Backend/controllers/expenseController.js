const pool = require('../config/db');

const addExpense = async (req, res) => {
  try {
    const userId = req.user.id;
    const { category_id, amount, expense_date, note } = req.body;

    await pool.query(
      'INSERT INTO expenses (user_id, category_id, amount, expense_date, note) VALUES (?, ?, ?, ?, ?)',
      [userId, category_id, amount, expense_date, note || null]
    );

    res.json({
      success: true,
      message: 'Expense added',
    });
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
        e.created_at,
        e.updated_at
      FROM expenses e
      JOIN categories c ON c.id = e.category_id
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
    const userId = req.user.id;
    const { id } = req.params;
    const { amount, category_id, expense_date, note } = req.body;

    const [result] = await pool.query(
      'UPDATE expenses SET amount = ?, category_id = ?, expense_date = ?, note = ? WHERE id = ? AND user_id = ?',
      [amount, category_id, expense_date, note || null, id, userId]
    );

    if (result.affectedRows === 0) {
      return res.status(404).json({
        success: false,
        message: 'Expense not found',
      });
    }

    res.json({
      success: true,
      message: 'Expense updated',
    });
  } catch (err) {
    res.status(500).json({
      success: false,
      message: err.message,
    });
  }
};

const deleteExpense = async (req, res) => {
  try {
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
