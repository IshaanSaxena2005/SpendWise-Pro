const express = require('express');
const { getNextMonthForecast } = require('../controllers/forecastController');
const authMiddleware = require('../middleware/authMiddleware');

const router = express.Router();

// Ensure all forecast routes are protected
router.use(authMiddleware);

// GET /api/forecast
router.get('/', getNextMonthForecast);

module.exports = router;
