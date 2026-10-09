const pool = require('../config/db');
const axios = require('axios');

/**
 * Anomaly detection guards (anomaly-alert audit follow-up).
 *
 * MIN_HISTORY: with a 2-point history the old pipeline flagged EVERY expense
 * (all points share the same isolation depth and the legacy `score <= 0.05`
 * band caught the flat score). A meaningful baseline needs at least 10
 * previous expenses before an opinion is offered; with fewer we return
 * insufficient_history — never an error, never a notification.
 *
 * MIN_ANOMALY_AMOUNT: a secondary safety net so trivial test transactions
 * (₹1, ₹5, ₹19) can never be labelled "unusually high". It documents scale,
 * it does not define high spending: a small absolute amount can still be
 * anomalous when a user's normal spending is much smaller — it simply
 * bypasses this one guard and must still clear MIN_HISTORY, the
 * IsolationForest and the median+MAD HIGH check in the ML service.
 */
const MIN_HISTORY = 10;
const MIN_ANOMALY_AMOUNT = 20;

const checkAnomaly = async (userId, amount, categoryId, expenseId = null) => {
  try {
    // Trivial amounts are never "unusually high" spending. Checked before the
    // DB roundtrip so a ₹1 test transaction does no work at all.
    if (Number(amount) < MIN_ANOMALY_AMOUNT) {
      return { is_anomaly: false, reason: 'amount_below_threshold' };
    }

    // "Previous qualifying expenses" = same user, same category, strict
    // transaction_type = 'expense' (income must not poison spending stats —
    // the column name was verified in schema.sql), most recent first.
    // The just-inserted row is excluded BY ID so it can never sit in its own
    // baseline; passing the id is deterministic, unlike query timing.
    const [expenses] = await pool.query(
      `SELECT amount, id
       FROM expenses
       WHERE user_id = ?
         AND category_id = ?
         AND transaction_type = 'expense'
         ${expenseId ? 'AND id <> ?' : ''}
       ORDER BY expense_date DESC, id DESC
       LIMIT 10`,
      expenseId ? [userId, categoryId, expenseId] : [userId, categoryId]
    );

    // Fewer than 10 previous expenses → no baseline, no verdict, no alert.
    if (expenses.length < MIN_HISTORY) {
      return { is_anomaly: false, reason: 'insufficient_history' };
    }

    const history = expenses.map((e) => Number(e.amount));

    const mlServiceUrl = process.env.ML_SERVICE_URL;
    if (!mlServiceUrl) {
      console.error('ML_SERVICE_URL not configured');
      return { is_anomaly: false };
    }

    const response = await axios.post(
      `${mlServiceUrl}/anomaly`,
      { history, current_expense: amount },
      {
        headers: { 'x-ml-api-key': process.env.ML_API_KEY || '' },
        timeout: 4000,
      }
    );

    // The machine-readable reason is authoritative (insufficient_history,
    // not_high_spending, not_anomaly, anomaly_detected). A payload claiming
    // is_anomaly=true with reason='not_high_spending' must NOT create an
    // "unusually high" alert, so is_anomaly is derived from the reason when
    // one is present. Legacy responses without a reason fall back to the
    // boolean alone (backward compatible).
    const reason = response.data && response.data.reason;
    if (typeof reason === 'string' && reason.length > 0) {
      return { is_anomaly: reason === 'anomaly_detected', reason };
    }
    const legacyIsAnomaly = Boolean(response.data && response.data.is_anomaly);
    return { is_anomaly: legacyIsAnomaly, reason: legacyIsAnomaly ? 'anomaly_detected' : 'not_anomaly' };
  } catch (err) {
    // Detection must never prevent a valid expense from being created.
    // ML unavailable, timeout, 401/403, 5xx, malformed payload all degrade to
    // "no anomaly" — and no internal details are returned to the frontend.
    console.error('Error checking anomaly:', err);
    return { is_anomaly: false };
  }
};

const getAnomalyHistory = async (userId) => {
  try {
    // Only pre-CASCADE legacy rows can have expense_id = NULL, and a CASCADE
    // deletion removes the notification row itself, so verifying that a
    // linked expense still exists keeps the dashboard free of orphaned stale
    // alerts even if a legacy FK was dropped manually at some point.
    const [notifications] = await pool.query(
      `SELECT n.* FROM notifications n
       WHERE n.user_id = ? AND n.type = 'anomaly'
         AND (n.expense_id IS NOT NULL
              AND EXISTS (SELECT 1 FROM expenses e WHERE e.id = n.expense_id))
       ORDER BY n.created_at DESC
       LIMIT 10`,
      [userId]
    );
    return notifications;
  } catch (err) {
    console.error('Error fetching anomaly history:', err);
    return [];
  }
};

/**
 * Create the anomaly notification for an expense — at most once.
 *
 * Phase 8 duplicate prevention: the (user_id, expense_id, type='anomaly')
 * guard makes a retried/double-submitted add request a no-op instead of a
 * second identical alert. The pair is scoped by user_id, so an expense_id can
 * never attach an alert to another user's notifications.
 *
 * Returns true when a notification was created, false when one already existed.
 */
const createAnomalyNotificationOnce = async (userId, expenseId, title, description) => {
  const [existing] = await pool.query(
    `SELECT id FROM notifications
     WHERE user_id = ? AND expense_id = ? AND type = 'anomaly'
     LIMIT 1`,
    [userId, expenseId]
  );
  if (existing.length > 0) {
    return false;
  }
  await pool.query(
    `INSERT INTO notifications (user_id, title, description, type, read_status, expense_id)
     VALUES (?, ?, ?, 'anomaly', FALSE, ?)`,
    [userId, title, description, expenseId]
  );
  return true;
};

module.exports = {
  checkAnomaly,
  getAnomalyHistory,
  createAnomalyNotificationOnce,
  MIN_HISTORY,
  MIN_ANOMALY_AMOUNT,
};
