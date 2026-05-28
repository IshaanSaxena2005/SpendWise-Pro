const pool = require('../config/db');

const addExpense = async (req, res) => {
  try {
    const { user_id, category_id, amount, expense_date, note } = req.body;

    await pool.query(
      'INSERT INTO expenses (user_id, category_id, amount, expense_date, note) VALUES (?, ?, ?, ?, ?)',
      [user_id, category_id, amount, expense_date, note || null]
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
      ORDER BY e.expense_date DESC, e.id DESC`
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
    const { id } = req.params;
    const { amount, category_id, expense_date, note } = req.body;

    await pool.query(
      'UPDATE expenses SET amount = ?, category_id = ?, expense_date = ?, note = ? WHERE id = ?',
      [amount, category_id, expense_date, note || null, id]
    );

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
    const { id } = req.params;

    await pool.query('DELETE FROM expenses WHERE id = ?', [id]);

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
