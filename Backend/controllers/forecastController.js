const pool = require('../config/db');
const axios = require('axios');

const getNextMonthForecast = async (req, res) => {
  try {
    const userId = req.user.id;

    const [rows] = await pool.query(
      `SELECT DATE_FORMAT(e.expense_date, '%Y-%m') as month,
              SUM(e.amount) as total
       FROM expenses e
       JOIN categories c ON c.id = e.category_id
       WHERE e.user_id = ?
         AND c.name NOT IN ('Salary', 'Freelance')
       GROUP BY month
       ORDER BY month ASC`,
      [userId]
    );

    const history = rows.map(row => Number(row.total));

    if (history.length < 3) {
      // Provide low-confidence estimate based on available data
      if (history.length > 0) {
        const avgSpending = history.reduce((a, b) => a + b, 0) / history.length;
        const confidence = Math.min(50, history.length * 15); // Max 50% confidence based on data points
        return res.json({
          success: true,
          predicted_spending: avgSpending,
          trend_direction: 'Stable',
          confidence: confidence,
          message: `Low-confidence estimate based on ${history.length} month(s) of data. More historical data will improve prediction accuracy.`,
          is_low_confidence: true
        });
      }
      return res.json({
        success: true,
        message: 'No spending data available for prediction.'
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
