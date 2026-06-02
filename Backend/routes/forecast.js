const express = require('express');
const { getNextMonthForecast } = require('../controllers/forecastController');
const authMiddleware = require('../middleware/authMiddleware');

const router = express.Router();

// Ensure all forecast routes are protected
router.use(authMiddleware);

// GET /api/forecast/next-month
router.get('/next-month', getNextMonthForecast);

module.exports = router;
