const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');
const crypto = require('crypto');
const pool = require('../config/db');
const { sendVerificationEmail, sendPasswordResetEmail } = require('../utils/email');

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
    const verificationToken = crypto.randomBytes(32).toString('hex');

    const [result] = await pool.query(
      'INSERT INTO users (full_name, email, password_hash, is_verified, verification_token) VALUES (?, ?, ?, ?, ?)',
      [full_name, email, passwordHash, false, verificationToken]
    );
    const userId = result.insertId;

    // Create default categories for new user
    const defaultCategories = [
      'Food',
      'Shopping',
      'Travel',
      'Entertainment',
      'Bills',
      'Health',
      'Salary',
      'Freelance'
    ];

    for (const categoryName of defaultCategories) {
      await pool.query(
        'INSERT IGNORE INTO categories (user_id, name) VALUES (?, ?)',
        [userId, categoryName]
      );
    }

    // Send verification email
    try {
      await sendVerificationEmail(email, verificationToken);
    } catch (emailErr) {
      console.error('Failed to send verification email:', emailErr.message);
    }

    res.status(201).json({
      success: true,
      message: 'Account created successfully. Please check your email to verify your account.',
      requiresVerification: true
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

    if (!user.is_verified) {
      return res.status(403).json({
        success: false,
        errorType: 'unverified',
        message: 'Please verify your email before logging in.',
      });
    }

    const token = jwt.sign(
      { id: user.id, user_id: user.id, email: user.email, full_name: user.full_name, role: user.role || 'Member' },
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
      { id: user.id, user_id: user.id, email: user.email, full_name: user.full_name, role: user.role || 'Member' },
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

const verifyEmail = async (req, res) => {
  try {
    const { token } = req.params;

    const [rows] = await pool.query(
      'SELECT id FROM users WHERE verification_token = ?',
      [token]
    );

    if (rows.length === 0) {
      return res.status(400).json({
        success: false,
        message: 'Invalid or expired verification token.',
      });
    }

    const userId = rows[0].id;

    await pool.query(
      'UPDATE users SET is_verified = TRUE, verification_token = NULL WHERE id = ?',
      [userId]
    );

    // Redirect to frontend with verified=true parameter
    const frontendUrl = process.env.FRONTEND_URL;
    if (!frontendUrl) {
      return res.status(500).json({
        success: false,
        message: 'FRONTEND_URL is not configured.',
      });
    }
    res.redirect(`${frontendUrl}/?verified=true`);
  } catch (err) {
    res.status(500).json({
      success: false,
      message: err.message,
    });
  }
};

const resendVerification = async (req, res) => {
  try {
    const { email } = req.body;

    if (!email) {
      return res.status(400).json({ success: false, message: 'Email is required.' });
    }

    const [rows] = await pool.query('SELECT * FROM users WHERE email = ?', [email]);
    if (rows.length === 0) {
      return res.status(404).json({ success: false, message: 'User not found.' });
    }

    const user = rows[0];

    if (user.is_verified) {
      return res.status(400).json({ success: false, message: 'Email is already verified.' });
    }

    const verificationToken = crypto.randomBytes(32).toString('hex');
    await pool.query('UPDATE users SET verification_token = ? WHERE id = ?', [verificationToken, user.id]);

    await sendVerificationEmail(email, verificationToken);

    res.json({ success: true, message: 'Verification email sent successfully.' });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};

const deleteAccount = async (req, res) => {
  let connection;
  try {
    const { password } = req.body;
    const userId = req.user.id;

    if (!password) {
      return res.status(400).json({ success: false, message: 'Password is required to delete your account.' });
    }

    // Verify user and password
    const [rows] = await pool.query('SELECT * FROM users WHERE id = ?', [userId]);
    if (rows.length === 0) {
      return res.status(404).json({ success: false, message: 'User not found.' });
    }

    const user = rows[0];
    const isPasswordValid = await bcrypt.compare(password, user.password_hash);

    if (!isPasswordValid) {
      return res.status(401).json({ success: false, message: 'Incorrect password.' });
    }

    connection = await pool.getConnection();
    await connection.beginTransaction();

    try {
      // Execute deletions in order (child tables first, though CASCADE handles it, explicit is safer)
      await connection.query('DELETE FROM budgets WHERE user_id = ?', [userId]);
      await connection.query('DELETE FROM expenses WHERE user_id = ?', [userId]);
      await connection.query('DELETE FROM categories WHERE user_id = ?', [userId]);
      await connection.query('DELETE FROM users WHERE id = ?', [userId]);

      await connection.commit();
      res.json({ success: true, message: 'Account deleted successfully.' });
    } catch (dbErr) {
      await connection.rollback();
      throw dbErr;
    }
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  } finally {
    if (connection) {
      connection.release();
    }
  }
};

const forgotPassword = async (req, res) => {
  try {
    const { email } = req.body;
    if (!email) {
      return res.status(400).json({ success: false, message: 'Email is required.' });
    }

    const [rows] = await pool.query('SELECT id FROM users WHERE email = ?', [email]);
    if (rows.length === 0) {
      // Don't leak if email exists or not, just return success
      return res.json({ success: true, message: 'If that email exists, a reset link has been sent.' });
    }

    const userId = rows[0].id;
    const resetToken = crypto.randomBytes(32).toString('hex');
    const hashedToken = await bcrypt.hash(resetToken, 10);
    // 30 minutes from now
    const expiresAt = new Date(Date.now() + 30 * 60000);

    // Delete any existing reset tokens for this user
    await pool.query('DELETE FROM password_resets WHERE user_id = ?', [userId]);

    await pool.query(
      'INSERT INTO password_resets (user_id, token, expires_at) VALUES (?, ?, ?)',
      [userId, hashedToken, expiresAt]
    );

    // Send the plain token via email
    await sendPasswordResetEmail(email, resetToken);

    res.json({ success: true, message: 'If that email exists, a reset link has been sent.' });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};

const resetPassword = async (req, res) => {
  try {
    const { email, token, newPassword } = req.body;

    if (!email || !token || !newPassword) {
      return res.status(400).json({ success: false, message: 'Missing required fields.' });
    }

    const [users] = await pool.query('SELECT id FROM users WHERE email = ?', [email]);
    if (users.length === 0) {
      return res.status(400).json({ success: false, message: 'Invalid or expired token.' });
    }
    const userId = users[0].id;

    // Get the reset token from DB
    const [resets] = await pool.query('SELECT * FROM password_resets WHERE user_id = ?', [userId]);
    if (resets.length === 0) {
      return res.status(400).json({ success: false, message: 'Invalid or expired token.' });
    }

    const resetRecord = resets[0];

    // Check expiry
    if (new Date() > new Date(resetRecord.expires_at)) {
      await pool.query('DELETE FROM password_resets WHERE id = ?', [resetRecord.id]);
      return res.status(400).json({ success: false, message: 'Token has expired. Please request a new one.' });
    }

    // Verify token
    const isValidToken = await bcrypt.compare(token, resetRecord.token);
    if (!isValidToken) {
      return res.status(400).json({ success: false, message: 'Invalid or expired token.' });
    }

    // Update password
    const passwordHash = await bcrypt.hash(newPassword, 10);
    await pool.query('UPDATE users SET password_hash = ? WHERE id = ?', [passwordHash, userId]);

    // Clean up token
    await pool.query('DELETE FROM password_resets WHERE id = ?', [resetRecord.id]);

    res.json({ success: true, message: 'Password has been reset successfully.' });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};

module.exports = {
  signup,
  login,
  updateProfile,
  verifyEmail,
  resendVerification,
  deleteAccount,
  forgotPassword,
  resetPassword,
};
