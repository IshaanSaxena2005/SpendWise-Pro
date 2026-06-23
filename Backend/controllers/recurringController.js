const pool = require('../config/db');

// Helper to limit queries to the authenticated user
const userWhere = (userId) => `WHERE user_id = ${pool.escape(userId)}`;

// GET all recurring templates for the current user
exports.getAll = async (req, res) => {
  try {
    const userId = req.user.id;
    const [rows] = await pool.query(`SELECT * FROM recurring_transactions ${userWhere(userId)}`);
    res.json({ success: true, data: rows });
  } catch (err) {
    console.error(err);
    res.status(500).json({ success: false, message: err.message });
  }
};

// CREATE a new recurring template – **does NOT create an expense**
exports.create = async (req, res) => {
  try {
    const userId = req.user.id;
    const { category_id, amount, note, frequency, next_due_date } = req.body;
    await pool.query(
      `INSERT INTO recurring_transactions (user_id, category_id, amount, note, frequency, next_due_date, is_active) VALUES (?,?,?,?,?,?,1)`,
      [userId, category_id, amount, note, frequency, next_due_date]
    );
    res.json({ success: true, message: 'Recurring template created' });
  } catch (err) {
    console.error(err);
    res.status(500).json({ success: false, message: err.message });
  }
};

// UPDATE an existing template (full replace) – keeps same semantics as before
exports.update = async (req, res) => {
  try {
    const userId = req.user.id;
    const id = req.params.id;
    const { category_id, amount, note, frequency, next_due_date, is_active } = req.body;
    await pool.query(
      `UPDATE recurring_transactions SET category_id = ?, amount = ?, note = ?, frequency = ?, next_due_date = ?, is_active = ? ${userWhere(userId)} AND id = ?`,
      [category_id, amount, note, frequency, next_due_date, is_active ? 1 : 0, id]
    );
    res.json({ success: true, message: 'Recurring template updated' });
  } catch (err) {
    console.error(err);
    res.status(500).json({ success: false, message: err.message });
  }
};

// DELETE a template
exports.remove = async (req, res) => {
  try {
    const userId = req.user.id;
    const id = req.params.id;
    await pool.query(`DELETE FROM recurring_transactions ${userWhere(userId)} AND id = ?`, [id]);
    res.json({ success: true, message: 'Recurring template deleted' });
  } catch (err) {
    console.error(err);
    res.status(500).json({ success: false, message: err.message });
  }
};

// PAUSE a template (set is_active = 0)
exports.pause = async (req, res) => {
  try {
    const userId = req.user.id;
    const id = req.params.id;
    await pool.query(`UPDATE recurring_transactions SET is_active = 0 ${userWhere(userId)} AND id = ?`, [id]);
    res.json({ success: true, message: 'Recurring template paused' });
  } catch (err) {
    console.error(err);
    res.status(500).json({ success: false, message: err.message });
  }
};

// RESUME a template (set is_active = 1)
exports.resume = async (req, res) => {
  try {
    const userId = req.user.id;
    const id = req.params.id;
    await pool.query(`UPDATE recurring_transactions SET is_active = 1 ${userWhere(userId)} AND id = ?`, [id]);
    res.json({ success: true, message: 'Recurring template resumed' });
  } catch (err) {
    console.error(err);
    res.status(500).json({ success: false, message: err.message });
  }
};
