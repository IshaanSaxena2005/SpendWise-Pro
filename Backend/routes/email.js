const express = require('express');
const authMiddleware = require('../middleware/authMiddleware');
const { DEMO_EMAIL } = require('../config/constants');
const {
  sendMonthlyReportsToAllUsers,
  sendWeeklyInsightsToAllUsers,
} = require('../services/emailNotificationService');

const router = express.Router();

// ── Scheduler endpoints ───────────────────────────────────────────────────────
// Protected by CRON_SECRET for external cron services. Defined BEFORE
// authMiddleware so they bypass user authentication (called by schedulers).

function requireCronSecret(req, res, next) {
  const cronSecret = req.headers['x-cron-secret'];
  if (cronSecret !== process.env.CRON_SECRET) {
    return res.status(403).json({
      success: false,
      message: 'Unauthorized: Invalid CRON_SECRET',
    });
  }
  next();
}

// Send the previous month's spending report to every real user (run on the 1st).
router.post('/cron/monthly-report', requireCronSecret, async (req, res) => {
  try {
    const result = await sendMonthlyReportsToAllUsers({ force: false });
    res.json({ success: true, message: 'Monthly reports processed', ...result });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// Send AI weekly insights to every real user with activity (run weekly).
router.post('/cron/weekly-insights', requireCronSecret, async (req, res) => {
  try {
    const result = await sendWeeklyInsightsToAllUsers({ force: false });
    res.json({ success: true, message: 'Weekly insights processed', ...result });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// ── Authenticated self-service endpoints ──────────────────────────────────────
router.use(authMiddleware);

function blockDemo(req, res) {
  if (req.user.email === DEMO_EMAIL) {
    res.status(403).json({
      success: false,
      message: 'Demo mode is read-only. Create your own account to receive email reports.',
    });
    return true;
  }
  return false;
}

// "Email me my last monthly report now" — bypasses dedup via force.
// Also bypasses the email_reports preference check so the user gets their
// report even if scheduled notifications are disabled.
router.post('/monthly-report/me', async (req, res) => {
  if (blockDemo(req, res)) return;
  try {
    const result = await sendMonthlyReportsToAllUsers({
      force: true,
      targetUserId: req.user.id,
      skipPreferenceCheck: true,
    });
    if (result.sent > 0) {
      return res.json({ success: true, message: 'Monthly report sent to your email.', ...result });
    }
    res.json({
      success: false,
      message: result.errors > 0
        ? 'Could not send the report right now. Please try again later.'
        : 'No activity found for last month, so no report was sent.',
      ...result,
    });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// "Email me my weekly insights now" — bypasses dedup via force.
router.post('/weekly-insights/me', async (req, res) => {
  if (blockDemo(req, res)) return;
  try {
    const result = await sendWeeklyInsightsToAllUsers({ force: true, targetUserId: req.user.id });
    if (result.sent > 0) {
      return res.json({ success: true, message: 'Weekly insights sent to your email.', ...result });
    }
    res.json({
      success: false,
      message: result.errors > 0
        ? 'Could not send insights right now. Please try again later.'
        : 'No spending recorded this week, so no insights were sent.',
      ...result,
    });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

module.exports = router;
