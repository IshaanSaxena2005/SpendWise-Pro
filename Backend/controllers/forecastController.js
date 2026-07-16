const pool = require('../config/db');
const axios = require('axios');
const { DEMO_EMAIL } = require('../config/constants');

const getNextMonthForecast = async (req, res) => {
  try {
    const userId = req.user.id;
    const userEmail = req.user.email;
    console.log(`[getNextMonthForecast] userId: ${userId}, email: ${userEmail}`);

    // Demo user hardcoded forecast values
    if (userEmail === DEMO_EMAIL) {
      const response = {
        success: true,
        predicted_spending: 52300,
        trend_direction: 'Stable',
        confidence: 90,
        mae: 1200,
        rmse: 1500,
        r2_score: 0.85,
        message: 'Demo forecast',
        spending_history: [49699, 48709, 58453, 51098, 50795, 51600]
      };
      console.log(`[getNextMonthForecast] Demo user response:`, JSON.stringify(response, null, 2));
      return res.json(response);
    }

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
    console.log(`[getNextMonthForecast] SQL result count: ${rows.length}`);
    console.log(`[getNextMonthForecast] SQL rows:`, rows);

    const history = rows.map(row => Number(row.total));
    console.log(`[getNextMonthForecast] history array:`, history);

    if (history.length < 3) {
      // Provide low-confidence estimate based on available data
      if (history.length > 0) {
        const avgSpending = history.reduce((a, b) => a + b, 0) / history.length;
        const confidence = Math.min(50, history.length * 15); // Max 50% confidence based on data points
        const response = {
          success: true,
          predicted_spending: avgSpending,
          trend_direction: 'Stable',
          confidence: confidence,
          message: `Low-confidence estimate based on ${history.length} month(s) of data. More historical data will improve prediction accuracy.`,
          is_low_confidence: true
        };
        console.log(`[getNextMonthForecast] Low-confidence response:`, JSON.stringify(response, null, 2));
        return res.json(response);
      }
      const response = {
        success: true,
        message: 'No spending data available for prediction.'
      };
      console.log(`[getNextMonthForecast] No data response:`, JSON.stringify(response, null, 2));
      return res.json(response);
    }

    const mlServiceUrl = process.env.ML_SERVICE_URL;
    if (!mlServiceUrl) {
      console.log(`[getNextMonthForecast] ML_SERVICE_URL not configured, using fallback`);
      const avgSpending = history.reduce((a, b) => a + b, 0) / history.length;
      const response = {
        success: true,
        predicted_spending: avgSpending,
        trend_direction: 'Stable',
        confidence: 75,
        message: 'ML service not configured. Using average spending as forecast.',
        is_low_confidence: true,
        spending_history: history
      };
      console.log(`[getNextMonthForecast] Fallback response:`, JSON.stringify(response, null, 2));
      return res.json(response);
    }

    try {
      console.log(`[getNextMonthForecast] Calling ML service at: ${mlServiceUrl}`);
      const flaskResponse = await axios.post(
        `${mlServiceUrl.replace(/\/$/, '')}/forecast`,
        {
          history: history
        }
      );
      console.log(`[getNextMonthForecast] ML service response:`, flaskResponse.data);

      const response = {
        success: true,
        spending_history: history,
        predicted_spending: flaskResponse.data.predicted_spending,
        trend_direction: flaskResponse.data.trend_direction,
        mae: flaskResponse.data.mae,
        rmse: flaskResponse.data.rmse,
        r2_score: flaskResponse.data.r2_score
      };
      console.log(`[getNextMonthForecast] JSON response:`, JSON.stringify(response, null, 2));
      res.json(response);
    } catch (mlError) {
      console.log(`[getNextMonthForecast] ML service unreachable, using fallback:`, mlError.message);
      const avgSpending = history.reduce((a, b) => a + b, 0) / history.length;
      const response = {
        success: true,
        predicted_spending: avgSpending,
        trend_direction: 'Stable',
        confidence: 75,
        message: 'ML service unavailable. Using average spending as forecast.',
        is_low_confidence: true,
        spending_history: history
      };
      console.log(`[getNextMonthForecast] Fallback response:`, JSON.stringify(response, null, 2));
      return res.json(response);
    }

  } catch (err) {
    console.error(`[getNextMonthForecast] Error:`, err);
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
