const pool = require('../config/db');

const signup = async (req, res) => {
  try {
    const { full_name, email, password } = req.body;

    await pool.query(
      'INSERT INTO users (full_name, email, password_hash) VALUES (?, ?, ?)',
      [full_name, email, password]
    );

    res.json({
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

const login = async (req, res) => {
  console.log(req.body);
  try {
    const { email, password } = req.body;

    const [rows] = await pool.query(
      'SELECT * FROM users WHERE email = ?',
      [email]
    );

    if (rows.length === 0) {
      return res.status(401).json({
        success: false,
        message: 'Invalid credentials',
      });
    }

    const user = rows[0];

    if (user.password_hash !== password) {
      return res.status(401).json({
        success: false,
        message: 'Invalid credentials',
      });
    }

    res.json({
      success: true,
      message: 'Login successful',
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
};
