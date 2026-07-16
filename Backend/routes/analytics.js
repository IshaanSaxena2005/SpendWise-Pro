const express = require('express');
const {
  getDashboardSummary,
  getCategoryBreakdown,
  getMonthlyTrend,
  getTopSpendingCategory,
  getFinancialHistory,
} = require('../controllers/analyticsController');
const authMiddleware = require('../middleware/authMiddleware');

const router = express.Router();

router.use(authMiddleware);

router.get('/dashboard-summary', getDashboardSummary);
router.get('/category-breakdown', getCategoryBreakdown);
router.get('/monthly-trend', getMonthlyTrend);
router.get('/top-category', getTopSpendingCategory);
router.get('/financial-history', getFinancialHistory);

module.exports = router;
