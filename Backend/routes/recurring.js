const express = require('express');
const authMiddleware = require('../middleware/authMiddleware');
const {
  createRecurringTransaction,
  getRecurringTransactions,
  updateRecurringTransaction,
  deleteRecurringTransaction,
  pauseRecurringTransaction,
  resumeRecurringTransaction,
} = require('../controllers/recurringController');
const { recurringValidation, idParamValidation } = require('../validators/recurringValidators');
const { processDueRecurringTransactions, getRecurringSummary, getRecurringExecutionHistory } = require('../services/recurringExecutionService');
const { requireCronSecret } = require('../middleware/cronAuth');

const router = express.Router();

// Scheduler endpoint - protected by CRON_SECRET for external cron services.
// This endpoint does NOT require authMiddleware as it's called by external
// schedulers; must be defined before authMiddleware to bypass authentication.
// requireCronSecret fails closed when CRON_SECRET is unset and compares in
// constant time (see middleware/cronAuth.js).
router.post('/process-due', requireCronSecret, async (req, res) => {
  try {
    const results = await processDueRecurringTransactions();
    
    res.json({
      success: true,
      message: 'Recurring transactions processed',
      ...results
    });
  } catch (err) {
    res.status(500).json({
      success: false,
      message: err.message,
    });
  }
});

// Protected routes requiring authentication
router.use(authMiddleware);

router.post('/', recurringValidation, createRecurringTransaction);
router.get('/', getRecurringTransactions);
router.get('/upcoming', getRecurringTransactions);
router.get('/summary', async (req, res) => {
  try {
    const summary = await getRecurringSummary(req.user.id);
    res.json({
      success: true,
      summary
    });
  } catch (err) {
    res.status(500).json({
      success: false,
      message: err.message
    });
  }
});
router.get('/:id/history', async (req, res) => {
  try {
    const history = await getRecurringExecutionHistory(req.params.id, req.user.id);
    res.json({
      success: true,
      history
    });
  } catch (err) {
    res.status(500).json({
      success: false,
      message: err.message
    });
  }
});
router.put('/:id', idParamValidation, recurringValidation, updateRecurringTransaction);
router.delete('/:id', idParamValidation, deleteRecurringTransaction);
router.patch('/:id/pause', idParamValidation, pauseRecurringTransaction);
router.patch('/:id/resume', idParamValidation, resumeRecurringTransaction);

module.exports = router;
