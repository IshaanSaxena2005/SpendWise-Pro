const pool = require('../config/db');
const axios = require('axios');

const getNextMonthForecast = async (req, res) => {
  try {
    const userId = req.user.id;

    const [rows] = await pool.query(
      `SELECT DATE_FORMAT(expense_date, '%Y-%m') as month,
              SUM(amount) as total
       FROM expenses
       WHERE user_id = ?
       GROUP BY month
       ORDER BY month ASC`,
      [userId]
    );

    const history = rows.map(row => Number(row.total));

    if (history.length < 3) {
      return res.json({
        success: true,
        message: 'Not enough historical data for prediction.'
      });
    }

    const mlServiceUrl = process.env.ML_SERVICE_URL;
    if (!mlServiceUrl) {
      return res.status(500).json({
        success: false,
        message: 'ML_SERVICE_URL is not configured.'
      });
    }

    const flaskResponse = await axios.post(
      `${mlServiceUrl.replace(/\/$/, '')}/forecast`,
      {
        history: history
      }
    );

    const response = {
      success: true,
      spending_history: history,
      predicted_spending: flaskResponse.data.predicted_spending,
      trend_direction: flaskResponse.data.trend_direction,
      mae: flaskResponse.data.mae,
      rmse: flaskResponse.data.rmse,
      r2_score: flaskResponse.data.r2_score
    };

    res.json(response);

  } catch (err) {
    if (err.response) {
      return res.status(500).json({
        success: false,
        message: 'Error from ML service'
      });
    }

    res.status(500).json({
      success: false,
      message: 'Unable to generate forecast.'
    });
  }
};

module.exports = {
  getNextMonthForecast,
};
