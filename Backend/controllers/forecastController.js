const pool = require('../config/db');
const axios = require('axios');

const getNextMonthForecast = async (req, res) => {

  console.log("========== FORECAST REQUEST RECEIVED ==========");

  try {
    const userId = req.user.id;

    console.log("User ID:", userId);

    const [rows] = await pool.query(
      `SELECT DATE_FORMAT(expense_date, '%Y-%m') as month,
              SUM(amount) as total
       FROM expenses
       WHERE user_id = ?
       GROUP BY month
       ORDER BY month ASC`,
      [userId]
    );

    console.log("DB Rows:", rows);

    const history = rows.map(row => Number(row.total));

    console.log("History:", history);

    if (history.length === 0) {
      return res.status(400).json({
        success: false,
        message: 'Not enough data to forecast. Please log some expenses first.'
      });
    }

    console.log("Calling Flask Service...");

    const flaskResponse = await axios.post(
      'http://localhost:5001/forecast',
      {
        history: history
      }
    );

    console.log("Flask Response:");
    console.log(flaskResponse.data);

    const response = {
      success: true,
      spending_history: history,
      predicted_spending: flaskResponse.data.predicted_spending,
      trend_direction: flaskResponse.data.trend_direction,
      mae: flaskResponse.data.mae,
      rmse: flaskResponse.data.rmse,
      r2_score: flaskResponse.data.r2_score
    };

    console.log("Final Response:");
    console.log(response);

    res.json(response);

  } catch (err) {

    console.log("========== FORECAST ERROR ==========");

    console.error("Message:", err.message);
    console.error("Code:", err.code);

    if (err.response) {
      console.error("Status:", err.response.status);
      console.error("Data:", err.response.data);

      return res.status(500).json({
        success: false,
        message: 'Error from ML service',
        error: err.response.data
      });
    }

    console.error(err);

    res.status(500).json({
      success: false,
      message: err.message || 'Unknown Error'
    });
  }
};

module.exports = {
  getNextMonthForecast,
};