const pool = require('../config/db');

const signup = async (req, res) => {
  try {
    const { full_name, email, password } = req.body;

    await pool.query(
      'INSERT INTO users (full_name, email, password_hash) VALUES (?, ?, ?)',
      [full_name, email, password]
    );

    res.status(201).json({
      success: true,
      message: 'User created',
    });
  } catch (err) {
    res.status(500).json({
      success: false,
      message: err.message,
    });
  }
};

const login = (req, res) => {};

module.exports = {
  signup,
  login,
};
