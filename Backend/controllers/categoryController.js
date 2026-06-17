const pool = require('../config/db');


const createCategory = async (req, res) => {
  try {
    const userId = req.user.id;
    const { name, icon } = req.body;

    const [result] = await pool.query(
      'INSERT INTO categories (user_id, name, icon) VALUES (?, ?, ?)',
      [userId, name, icon || null]
    );

    const [categories] = await pool.query(
      'SELECT id, user_id, name, icon, created_at FROM categories WHERE id = ? AND user_id = ?',
      [result.insertId, userId]
    );

    res.json({
      success: true,
      message: 'Category created',
      category: categories[0],
    });
  } catch (err) {
    if (err.code === 'ER_DUP_ENTRY') {
      return res.status(409).json({
        success: false,
        message: 'Category name already exists',
      });
    }

    res.status(500).json({
      success: false,
      message: err.message,
    });
  }
};

const getCategories = async (req, res) => {
  try {
    const userId = req.user.id;

    const [categories] = await pool.query(
      'SELECT id, user_id, name, icon, created_at FROM categories WHERE user_id = ? ORDER BY name ASC',
      [userId]
    );

    res.json({
      success: true,
      categories,
    });
  } catch (err) {
    res.status(500).json({
      success: false,
      message: err.message,
    });
  }
};

const updateCategory = async (req, res) => {
  try {
    const userId = req.user.id;
    const { id } = req.params;
    const { name, icon } = req.body;

    const [result] = await pool.query(
      'UPDATE categories SET name = ?, icon = ? WHERE id = ? AND user_id = ?',
      [name, icon ?? null, id, userId]
    );

    if (result.affectedRows === 0) {
      return res.status(404).json({
        success: false,
        message: 'Category not found',
      });
    }

    res.json({
      success: true,
      message: 'Category updated',
    });
  } catch (err) {
    if (err.code === 'ER_DUP_ENTRY') {
      return res.status(409).json({
        success: false,
        message: 'Category name already exists',
      });
    }

    res.status(500).json({
      success: false,
      message: err.message,
    });
  }
};

const deleteCategory = async (req, res) => {
  try {
    const userId = req.user.id;
    const { id } = req.params;

    const [result] = await pool.query(
      'DELETE FROM categories WHERE id = ? AND user_id = ?',
      [id, userId]
    );

    if (result.affectedRows === 0) {
      return res.status(404).json({
        success: false,
        message: 'Category not found',
      });
    }

    res.json({
      success: true,
      message: 'Category deleted',
    });
  } catch (err) {
    if (err.code === 'ER_ROW_IS_REFERENCED_2' || err.errno === 1451) {
      return res.status(400).json({
        success: false,
        message: 'Cannot delete category. It is used by existing expenses.',
      });
    }

    res.status(500).json({
      success: false,
      message: err.message,
    });
  }
};

module.exports = {
  createCategory,
  getCategories,
  updateCategory,
  deleteCategory,
};
