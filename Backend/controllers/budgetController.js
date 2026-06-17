const pool = require('../config/db');

function normalizeBudgetMonth(value) {
  if (value === null || value === undefined || value === '') {
    return value;
  }

  const str = String(value).trim();
  const isoMatch = str.match(/^(\d{4})-(\d{2})/);
  if (isoMatch) {
    return `${isoMatch[1]}-${isoMatch[2]}-01`;
  }

  const dmyMatch = str.match(/^(\d{2})-(\d{2})-(\d{4})$/);
  if (dmyMatch) {
    return `${dmyMatch[3]}-${dmyMatch[2]}-01`;
  }

  const parsed = new Date(str);
  if (!Number.isNaN(parsed.getTime())) {
    const year = parsed.getFullYear();
    const month = String(parsed.getMonth() + 1).padStart(2, '0');
    return `${year}-${month}-01`;
  }

  return str;
}

const createBudget = async (req, res) => {
  try {
    const userId = req.user.id;
    const { category_id, amount_limit } = req.body;
    const categoryId = category_id ?? null;
    const month = normalizeBudgetMonth(req.body.month);

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
        DATE_FORMAT(b.month, '%Y-%m-%d') AS month,
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
    const { category_id, amount_limit } = req.body;
    const categoryId = category_id ?? null;
    const normalizedMonth = normalizeBudgetMonth(req.body.month);

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
        [userId, normalizedMonth, id]
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
      [categoryId, normalizedMonth, amount_limit, id, userId]
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
