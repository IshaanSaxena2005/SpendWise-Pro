const pool = require('../config/db');

const createBudget = async (req, res) => {
  try {
    const userId = req.user.id;
    const { category_id, month, amount_limit } = req.body;
    const categoryId = category_id || null;

    if (categoryId) {
      const [categories] = await pool.query(
        'SELECT id FROM categories WHERE id = ? AND user_id = ?',
        [categoryId, userId]
      );

      if (categories.length === 0) {
        return res.status(400).json({
          success: false,
          message: 'Invalid category',
        });
      }
    } else {
      const [existing] = await pool.query(
        'SELECT id FROM budgets WHERE user_id = ? AND category_id IS NULL AND month = ?',
        [userId, month]
      );

      if (existing.length > 0) {
        return res.status(409).json({
          success: false,
          message: 'Overall budget for this month already exists',
        });
      }
    }

    await pool.query(
      'INSERT INTO budgets (user_id, category_id, month, amount_limit) VALUES (?, ?, ?, ?)',
      [userId, categoryId, month, amount_limit]
    );

    res.json({
      success: true,
      message: 'Budget created',
    });
  } catch (err) {
    if (err.code === 'ER_DUP_ENTRY') {
      return res.status(409).json({
        success: false,
        message: 'Budget already exists for this category and month',
      });
    }

    res.status(500).json({
      success: false,
      message: err.message,
    });
  }
};

const getBudgets = async (req, res) => {
  try {
    const userId = req.user.id;

    const [budgets] = await pool.query(
      `SELECT
        b.id,
        b.user_id,
        b.category_id,
        c.name AS category_name,
        b.month,
        b.amount_limit,
        b.created_at,
        b.updated_at
      FROM budgets b
      LEFT JOIN categories c ON c.id = b.category_id
      WHERE b.user_id = ?
      ORDER BY b.month DESC, b.id DESC`,
      [userId]
    );

    res.json({
      success: true,
      budgets,
    });
  } catch (err) {
    res.status(500).json({
      success: false,
      message: err.message,
    });
  }
};

const updateBudget = async (req, res) => {
  try {
    const userId = req.user.id;
    const { id } = req.params;
    const { category_id, month, amount_limit } = req.body;
    const categoryId = category_id || null;

    if (categoryId) {
      const [categories] = await pool.query(
        'SELECT id FROM categories WHERE id = ? AND user_id = ?',
        [categoryId, userId]
      );

      if (categories.length === 0) {
        return res.status(400).json({
          success: false,
          message: 'Invalid category',
        });
      }
    } else {
      const [existing] = await pool.query(
        'SELECT id FROM budgets WHERE user_id = ? AND category_id IS NULL AND month = ? AND id != ?',
        [userId, month, id]
      );

      if (existing.length > 0) {
        return res.status(409).json({
          success: false,
          message: 'Overall budget for this month already exists',
        });
      }
    }

    const [result] = await pool.query(
      'UPDATE budgets SET category_id = ?, month = ?, amount_limit = ? WHERE id = ? AND user_id = ?',
      [categoryId, month, amount_limit, id, userId]
    );

    if (result.affectedRows === 0) {
      return res.status(404).json({
        success: false,
        message: 'Budget not found',
      });
    }

    res.json({
      success: true,
      message: 'Budget updated',
    });
  } catch (err) {
    if (err.code === 'ER_DUP_ENTRY') {
      return res.status(409).json({
        success: false,
        message: 'Budget already exists for this category and month',
      });
    }

    res.status(500).json({
      success: false,
      message: err.message,
    });
  }
};

const deleteBudget = async (req, res) => {
  try {
    const userId = req.user.id;
    const { id } = req.params;

    const [result] = await pool.query(
      'DELETE FROM budgets WHERE id = ? AND user_id = ?',
      [id, userId]
    );

    if (result.affectedRows === 0) {
      return res.status(404).json({
        success: false,
        message: 'Budget not found',
      });
    }

    res.json({
      success: true,
      message: 'Budget deleted',
    });
  } catch (err) {
    res.status(500).json({
      success: false,
      message: err.message,
    });
  }
};

module.exports = {
  createBudget,
  getBudgets,
  updateBudget,
  deleteBudget,
};
