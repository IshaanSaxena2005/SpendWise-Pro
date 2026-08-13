const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');
const crypto = require('crypto');
const pool = require('../config/db');
const { sendVerificationEmail, sendPasswordResetEmail } = require('../utils/email');
const { OAuth2Client } = require('google-auth-library');
const { DEMO_EMAIL } = require('../config/constants');

const client = new OAuth2Client(process.env.GOOGLE_CLIENT_ID);

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
      `INSERT INTO users
        (full_name, email, password_hash, is_verified, verification_token, verification_token_expires_at, auth_provider, has_local_password)
       VALUES (?, ?, ?, ?, ?, ?, 'email', TRUE)`,
      [full_name, email, passwordHash, false, verificationToken, new Date(Date.now() + 24 * 60 * 60 * 1000)]
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
      'Fuel'
    ];

    for (const categoryName of defaultCategories) {
      await pool.query(
        'INSERT IGNORE INTO categories (user_id, name) VALUES (?, ?)',
        [userId, categoryName]
      );
    }

    // Do not claim that the verification email was sent if Brevo rejected it.
    // The account remains unverified and the user can use resend-verification.
    try {
      await sendVerificationEmail(email, verificationToken);
    } catch (emailErr) {
      console.error('Failed to send verification email:', emailErr.message);
      return res.status(502).json({
        success: false,
        errorType: 'verification_email_failed',
        message: 'Your account was created, but we could not send the verification email. Please try again using resend verification.',
      });
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
    if (req.user.email === DEMO_EMAIL) {
      return res.status(403).json({
        success: false,
        message: 'Demo mode is read-only. Create your own account to manage personal finances.'
      });
    }

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
      'SELECT id FROM users WHERE verification_token = ? AND verification_token_expires_at > NOW()',
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
      'UPDATE users SET is_verified = TRUE, verification_token = NULL, verification_token_expires_at = NULL WHERE id = ?',
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
    await pool.query(
      'UPDATE users SET verification_token = ?, verification_token_expires_at = ? WHERE id = ?',
      [verificationToken, new Date(Date.now() + 24 * 60 * 60 * 1000), user.id],
    );

    await sendVerificationEmail(email, verificationToken);

    res.json({ success: true, message: 'Verification email sent successfully.' });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};

const deleteAccount = async (req, res) => {
  let connection;
  try {
    if (req.user.email === DEMO_EMAIL) {
      return res.status(403).json({
        success: false,
        message: 'Demo mode is read-only. Create your own account to manage personal finances.'
      });
    }

    const userId = req.user.id;

    // Verify user exists
    const [rows] = await pool.query('SELECT * FROM users WHERE id = ?', [userId]);
    if (rows.length === 0) {
      return res.status(404).json({ success: false, message: 'User not found.' });
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
      // No additional session or token tables exist, so no extra cleanup is required here
      res.json({
        success: true,
        message: "Your account and all associated data have been permanently deleted."
      });
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

    // Check if demo user is trying to reset password
    if (email === DEMO_EMAIL) {
      return res.status(403).json({
        success: false,
        message: 'Demo mode is read-only. Create your own account to manage personal finances.'
      });
    }

    if (!email || !token || !newPassword) {
      return res.status(400).json({ success: false, message: 'Missing required fields.' });
    }

    const [users] = await pool.query('SELECT id, password_hash FROM users WHERE email = ?', [email]);
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

    const isSamePassword = await bcrypt.compare(newPassword, users[0].password_hash);
    if (isSamePassword) {
      return res.status(400).json({
        success: false,
        message: 'New password must be different from your current password.',
      });
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

const getAccountSecurity = async (req, res) => {
  try {
    const [rows] = await pool.query(
      'SELECT has_local_password FROM users WHERE id = ? LIMIT 1',
      [req.user.id],
    );
    if (!rows.length) {
      return res.status(404).json({ success: false, message: 'User not found.' });
    }
    return res.json({ success: true, hasLocalPassword: Boolean(rows[0].has_local_password) });
  } catch (err) {
    return res.status(500).json({ success: false, message: err.message });
  }
};

const updatePassword = async (req, res) => {
  try {
    if (req.user.email === DEMO_EMAIL) {
      return res.status(403).json({ success: false, message: 'Demo mode is read-only.' });
    }

    const { currentPassword, newPassword } = req.body;
    const [rows] = await pool.query(
      'SELECT password_hash, has_local_password FROM users WHERE id = ? LIMIT 1',
      [req.user.id],
    );
    if (!rows.length) {
      return res.status(404).json({ success: false, message: 'User not found.' });
    }

    const user = rows[0];
    if (user.has_local_password) {
      if (!currentPassword) {
        return res.status(400).json({ success: false, message: 'Current password is required.' });
      }
      const isCurrentPasswordValid = await bcrypt.compare(currentPassword, user.password_hash);
      if (!isCurrentPasswordValid) {
        return res.status(400).json({ success: false, message: 'Current password is incorrect.' });
      }
    }

    const passwordHash = await bcrypt.hash(newPassword, 10);
    await pool.query(
      'UPDATE users SET password_hash = ?, has_local_password = TRUE WHERE id = ?',
      [passwordHash, req.user.id],
    );
    return res.json({
      success: true,
      message: user.has_local_password ? 'Password updated successfully.' : 'Password set successfully. You can now sign in with email and password.',
      hasLocalPassword: true,
    });
  } catch (err) {
    return res.status(500).json({ success: false, message: err.message });
  }
};

const googleLogin = async (req, res) => {
  try {
    const { token } = req.body;
    if (!token) {
      return res.status(400).json({ success: false, message: 'Google token is required.' });
    }

    const ticket = await client.verifyIdToken({
      idToken: token,
      audience: process.env.GOOGLE_CLIENT_ID,
    });
    const payload = ticket.getPayload();
    const { email, name } = payload;

    const [rows] = await pool.query('SELECT * FROM users WHERE email = ?', [email]);
    
    let user;
    if (rows.length > 0) {
      user = rows[0];
      // Note: we could also optionally update is_verified to true here if not already verified
    } else {
      // Retain a non-usable random hash for legacy NOT NULL schemas. The explicit
      // marker below, rather than the presence of this hash, determines whether
      // the user must provide a current password in Settings.
      const randomPassword = crypto.randomBytes(16).toString('hex');
      const passwordHash = await bcrypt.hash(randomPassword, 10);
      
      const [result] = await pool.query(
        `INSERT INTO users
          (full_name, email, password_hash, is_verified, auth_provider, has_local_password)
         VALUES (?, ?, ?, ?, 'google', FALSE)`,
        [name, email, passwordHash, true]
      );
      
      user = {
        id: result.insertId,
        email,
        full_name: name,
        role: 'Member'
      };

      const defaultCategories = [
        'Food', 'Shopping', 'Travel', 'Entertainment',
        'Bills', 'Health', 'Salary', 'Fuel'
      ];

      for (const categoryName of defaultCategories) {
        await pool.query(
          'INSERT IGNORE INTO categories (user_id, name) VALUES (?, ?)',
          [user.id, categoryName]
        );
      }
    }

    const appToken = jwt.sign(
      { id: user.id, user_id: user.id, email: user.email, full_name: user.full_name, role: user.role || 'Member' },
      process.env.JWT_SECRET,
      { expiresIn: '1d' }
    );

    res.json({
      success: true,
      message: 'Google login successful.',
      token: appToken,
    });
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
  getAccountSecurity,
  updatePassword,
  googleLogin,
};
