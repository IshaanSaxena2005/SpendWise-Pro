const pool = require('../config/db');
const axios = require('axios');

const checkAnomaly = async (userId, amount, categoryId) => {
  try {
    const [expenses] = await pool.query(
      `SELECT amount 
       FROM expenses 
       WHERE user_id = ? AND category_id = ? 
       ORDER BY expense_date DESC 
       LIMIT 10`,
      [userId, categoryId]
    );

    const history = expenses.map(e => Number(e.amount));
    if (history.length < 2) {
      return { is_anomaly: false };
    }

    const mlServiceUrl = process.env.ML_SERVICE_URL;
    if (!mlServiceUrl) {
      console.error('ML_SERVICE_URL not configured');
      return { is_anomaly: false };
    }

    const response = await axios.post(`${mlServiceUrl}/anomaly`, {
      history,
      current_expense: amount
    });

    return response.data;
  } catch (err) {
    console.error('Error checking anomaly:', err);
    return { is_anomaly: false };
  }
};

const getAnomalyHistory = async (userId) => {
  try {
    const [notifications] = await pool.query(
      `SELECT n.* 
       FROM notifications n 
       WHERE n.user_id = ? 
         AND n.type = 'anomaly' 
       ORDER BY n.created_at DESC 
       LIMIT 10`,
      [userId]
    );
    return notifications;
  } catch (err) {
    console.error('Error fetching anomaly history:', err);
    return [];
  }
};

module.exports = { checkAnomaly, getAnomalyHistory };
