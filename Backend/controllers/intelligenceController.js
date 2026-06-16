const pool = require('../config/db');
const { generateIntelligence } = require('../services/intelligenceService');

const generate = async (req, res) => {
  try {
    const userId = req.user.id;
    await generateIntelligence(userId);
    res.json({ success: true, message: 'Intelligence generated successfully' });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};

const getInsights = async (req, res) => {
  try {
    const userId = req.user.id;
    const [rows] = await pool.query(
      'SELECT * FROM ai_insights WHERE user_id = ? ORDER BY created_at DESC',
      [userId]
    );
    res.json({ success: true, insights: rows });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};

const getRecommendations = async (req, res) => {
  try {
    const userId = req.user.id;
    const [rows] = await pool.query(
      'SELECT * FROM recommendations WHERE user_id = ? ORDER BY created_at DESC',
      [userId]
    );
    res.json({ success: true, recommendations: rows });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};

module.exports = {
  generate,
  getInsights,
  getRecommendations,
};
