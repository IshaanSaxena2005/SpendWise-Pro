const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');
const pool = require('../config/db');

const signup = async (req, res) => {
  try {
    const { full_name, email, password } = req.body;

    // Validate all required fields
    if (!full_name || !email || !password) {
      return res.status(400).json({
        success: false,
        message: 'full_name, email, and password are all required.',
      });
    }

    // Check if email already registered
    const [existing] = await pool.query(
      'SELECT id FROM users WHERE email = ?',
      [email]
    );
    if (existing.length > 0) {
      return res.status(409).json({
        success: false,
        message: 'An account with this email already exists.',
      });
    }

    const passwordHash = await bcrypt.hash(password, 10);

    const [result] = await pool.query(
      'INSERT INTO users (full_name, email, password_hash) VALUES (?, ?, ?)',
      [full_name, email, passwordHash]
    );

    // Auto-login: return JWT immediately after signup
    const token = jwt.sign(
      { id: result.insertId, email, full_name, role: 'Member' },
      process.env.JWT_SECRET,
      { expiresIn: '1d' }
    );

    res.status(201).json({
      success: true,
      message: 'Account created successfully.',
      token,
    });
  } catch (err) {
    res.status(500).json({
      success: false,
      message: err.message,
    });
  }
};

const login = async (req, res) => {
  try {
    const { email, password } = req.body;

    // Validate required fields
    if (!email || !password) {
      return res.status(400).json({
        success: false,
        message: 'Email and password are required.',
      });
    }

    const [rows] = await pool.query(
      'SELECT * FROM users WHERE email = ?',
      [email]
    );

    if (rows.length === 0) {
      return res.status(401).json({
        success: false,
        message: 'Invalid email or password.',
      });
    }

    const user = rows[0];

    const isPasswordValid = await bcrypt.compare(password, user.password_hash);

    if (!isPasswordValid) {
      return res.status(401).json({
        success: false,
        message: 'Invalid email or password.',
      });
    }

    const token = jwt.sign(
      { id: user.id, email: user.email, full_name: user.full_name, role: user.role || 'Member' },
      process.env.JWT_SECRET,
      { expiresIn: '1d' }
    );

    res.json({
      success: true,
      message: 'Login successful.',
      token,
    });
  } catch (err) {
    res.status(500).json({
      success: false,
      message: err.message,
    });
  }
};

const updateProfile = async (req, res) => {
  try {
    const { full_name } = req.body;
    const userId = req.user.id;

    if (!full_name) {
      return res.status(400).json({
        success: false,
        message: 'full_name is required.',
      });
    }

    await pool.query(
      'UPDATE users SET full_name = ? WHERE id = ?',
      [full_name, userId]
    );

    // Fetch updated user to generate new token
    const [rows] = await pool.query(
      'SELECT * FROM users WHERE id = ?',
      [userId]
    );

    if (rows.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'User not found.',
      });
    }

    const user = rows[0];

    const token = jwt.sign(
      { id: user.id, email: user.email, full_name: user.full_name, role: user.role || 'Member' },
      process.env.JWT_SECRET,
      { expiresIn: '1d' }
    );

    res.json({
      success: true,
      message: 'Profile updated successfully.',
      token,
    });
  } catch (err) {
    res.status(500).json({
      success: false,
      message: err.message,
    });
  }
};

module.exports = {
  signup,
  login,
  updateProfile,
};
