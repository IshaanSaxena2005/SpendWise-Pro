const express = require('express');
const { downloadMonthlyReport, generateReportToken } = require('../controllers/reportController');
const authMiddleware = require('../middleware/authMiddleware');

const router = express.Router();

// Public endpoint - no auth required (uses token for verification)
router.get('/monthly/:token', downloadMonthlyReport);

// Protected endpoints - require authentication
router.use(authMiddleware);
router.post('/generate-token', generateReportToken);

module.exports = router;
