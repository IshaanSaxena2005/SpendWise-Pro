const pool = require('../config/db');
const axios = require('axios');

const getNextMonthForecast = async (req, res) => {
  try {
    const userId = req.user.id;

    // Query monthly spending totals from expenses table, ordered chronologically
    const [rows] = await pool.query(
      `SELECT DATE_FORMAT(expense_date, '%Y-%m') as month, SUM(amount) as total
       FROM expenses
       WHERE user_id = ?
       GROUP BY month
       ORDER BY month ASC`,
      [userId]
    );

    // Build spending history array
    const history = rows.map(row => Number(row.total));

    // We can only forecast if there's at least one month of history
    if (history.length === 0) {
       return res.status(400).json({ 
           success: false, 
           message: 'Not enough data to forecast. Please log some expenses first.' 
       });
    }

    // Call the Python ML Forecasting service
    const flaskResponse = await axios.post('http://localhost:5001/forecast', {
      history: history
    });

    // Return the required response format
    res.json({
      success: true,
      spending_history: history,
      predicted_spending: flaskResponse.data.predicted_spending,
      trend_direction: flaskResponse.data.trend_direction
    });

  } catch (err) {
    console.error('Forecast error:', err.message);
    if (err.response) {
      // Error came from the Flask ML Service
      return res.status(500).json({ 
          success: false, 
          message: 'Error from ML service', 
          error: err.response.data 
      });
    }
    // General server or database error
    res.status(500).json({ success: false, message: err.message });
  }
};

module.exports = {
  getNextMonthForecast,
};
