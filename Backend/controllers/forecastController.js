const pool = require('../config/db');
const axios = require('axios');
const { DEMO_EMAIL } = require('../config/constants');

// ── ML request tuning ────────────────────────────────────────────────────
// Fast timeout so a healthy-but-warm request from the dashboard doesn't hang…
const ML_FAST_TIMEOUT_MS = 4000;
// …but Render free-tier web services spin down when idle and can take ~50s
// to cold-start (measured in production: 51.9s /health). A single 4s attempt
// can therefore never deliver an ML forecast after idle, so a cold-start
// attempt falls back from timeout/ECONNRESET with a much longer budget.
const ML_COLD_START_TIMEOUT_MS = 55000;

// ML response schema constants (must match ML-Service/app.py /forecast).
const ML_TRENDS = ['Increasing', 'Decreasing', 'Stable'];

const buildMlUrl = () => {
  const raw = process.env.ML_SERVICE_URL;
  if (!raw) return null;
  const cleaned = raw.replace(/\/$/, '');
  // Guard against misconfiguration: a URL that already ends in /forecast
  // would produce /forecast/forecast after appending.
  return /\/forecast\/?$/.test(cleaned) ? null : cleaned;
};

/**
 * Classify an axios failure into a stable category, for logging and
 * fallback messaging. Never logs the API key, request payload, or any
 * financial data.
 */
const classifyMlFailure = (err) => {
  if (err && err.response) {
    const status = err.response.status;
    if (status === 401 || status === 403) return 'ml_auth_failed';
    if (status === 404) return 'ml_route_not_found';
    if (status === 400) return 'ml_bad_request';
    if (status >= 500) {
      // Surface the ML service's own error category if provided.
      const reason = err.response.data && err.response.data.reason;
      return reason === 'key_not_configured' ? 'ml_auth_not_configured' : 'ml_server_error';
    }
    return `ml_http_${status}`;
  }
  if (err && err.code) {
    switch (err.code) {
      case 'ECONNABORTED': return 'ml_timeout';          // axios timeout
      case 'ETIMEDOUT': return 'ml_timeout';
      case 'ECONNRESET': return 'ml_connection_reset';   // mid-transfer drop
      case 'ECONNREFUSED': return 'ml_connection_refused';
      case 'ENOTFOUND':
      case 'EAI_AGAIN': return 'ml_dns_failure';
      default: return 'ml_network_error';
    }
  }
  return 'ml_unknown_error';
};

// Cold-start-shaped failures are worth one patient retry; deterministic
// failures (auth, routing, DNS) are not.
const RETRYABLE_CATEGORIES = new Set(['ml_timeout', 'ml_connection_reset', 'ml_connection_refused']);

/**
 * POST { history } to the ML /forecast endpoint and validate the response.
 * Returns { ok, data?, failure? } — `failure` is a { category, messageDetail }
 * used for structured logging and honest fallback messaging.
 */
const requestMlForecast = async (history, timeoutMs) => {
  try {
    const response = await axios.post(
      `${process.env.ML_SERVICE_URL.replace(/\/$/, '')}/forecast`,
      { history },
      {
        headers: { 'x-ml-api-key': process.env.ML_API_KEY || '' },
        timeout: timeoutMs,
      }
    );
    const d = response.data || {};

    // Validate before use: the prediction must be a sane number and the
    // scalar fields must have expected shapes. Anything malformed is treated
    // as an invalid ML response, not silently trusted.
    const asFinite = (v) =>
      v === null || v === undefined || v === '' ? null : (Number.isFinite(Number(v)) ? Number(v) : null);
    const predicted = asFinite(d.predicted_spending);
    const invalid =
      predicted === null ||
      predicted < 0 ||
      (d.trend_direction !== undefined && d.trend_direction !== null && !ML_TRENDS.includes(d.trend_direction));
    if (invalid) {
      return { ok: false, failure: { category: 'ml_invalid_response', messageDetail: 'unexpected prediction format' } };
    }

    return {
      ok: true,
      data: {
        predicted_spending: predicted,
        trend_direction: ML_TRENDS.includes(d.trend_direction) ? d.trend_direction : 'Stable',
        mae: asFinite(d.mae),
        rmse: asFinite(d.rmse),
        r2_score: asFinite(d.r2_score),
      },
    };
  } catch (err) {
    const category = classifyMlFailure(err);
    return { ok: false, failure: { category, messageDetail: err.code || `HTTP ${err.response?.status}` } };
  }
};

const buildFallbackResponse = (history, failure) => {
  // Honest fallback confidence: a plain historical average carries NO model
  // quality signal, so it must never claim model-grade confidence. Same
  // formula as the low-data branch above: data scarcity drives the ceiling.
  const confidence = Math.min(50, history.length * 15);
  if (!failure) {
    return {
      success: true,
      predicted_spending: history.reduce((a, b) => a + b, 0) / history.length,
      trend_direction: 'Stable',
      confidence,
      message: 'ML service not configured. Using average spending as forecast.',
      is_low_confidence: true,
      forecast_source: 'average_fallback',
      spending_history: history,
    };
  }
  return {
    success: true,
    predicted_spending: history.reduce((a, b) => a + b, 0) / history.length,
    trend_direction: 'Stable',
    confidence,
    message: `ML service unavailable (${failure.category}). Using average spending as forecast.`,
    is_low_confidence: true,
    forecast_source: 'average_fallback',
    spending_history: history,
  };
};

const getNextMonthForecast = async (req, res) => {
  try {
    const userId = req.user.id;
    const userEmail = req.user.email;
    // No financial records in logs — identifiers only.
    console.log(`[getNextMonthForecast] userId: ${userId}`);

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
        forecast_source: 'demo',
        spending_history: [49699, 48709, 58453, 51098, 50795, 51600]
      };
      return res.json(response);
    }

    const [rows] = await pool.query(
      `SELECT DATE_FORMAT(e.expense_date, '%Y-%m') as month,
              SUM(e.amount) as total
       FROM expenses e
       WHERE e.user_id = ?
         AND e.transaction_type = 'expense'
       GROUP BY month
       ORDER BY month ASC`,
      [userId]
    );
    console.log(`[getNextMonthForecast] monthly history points: ${rows.length}`);

    const history = rows.map(row => Number(row.total));

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
          is_low_confidence: true,
          forecast_source: 'average_fallback'
        };
        return res.json(response);
      }
      const response = {
        success: true,
        forecast_source: 'none',
        message: 'No spending data available for prediction.'
      };
      return res.json(response);
    }

    const mlServiceUrl = buildMlUrl();
    if (!mlServiceUrl || mlServiceUrl.includes('localhost') || mlServiceUrl.includes('127.0.0.1')) {
      // localhost can never work in production — treat explicit localhost as a
      // configuration error so the log says exactly that.
      const isLocalhost = Boolean(mlServiceUrl);
      console.log(JSON.stringify({
        event: 'forecast_ml_fallback',
        handler: 'getNextMonthForecast',
        category: isLocalhost ? 'ml_url_is_localhost' : 'ml_not_configured',
        detail: isLocalhost
          ? 'localhost URL cannot be used from a hosted backend'
          : 'ML_SERVICE_URL is not set',
      }));
      return res.json(buildFallbackResponse(history, isLocalhost ? { category: 'ml_url_is_localhost' } : null));
    }

    // ── ML attempt 1 (fast) → single patient retry on cold-start-shaped failures ──
    const attempts = [];
    let result = null;
    for (let attempt = 1; attempt <= 2; attempt++) {
      const timeout = attempt === 1 ? ML_FAST_TIMEOUT_MS : ML_COLD_START_TIMEOUT_MS;
      const started = Date.now();
      result = await requestMlForecast(history, timeout);
      attempts.push({
        attempt,
        timeoutMs: timeout,
        elapsedMs: Date.now() - started,
        category: result.ok ? 'success' : result.failure.category,
      });
      if (result.ok || !RETRYABLE_CATEGORIES.has(result.failure.category)) break;
    }

    if (result.ok) {
      const d = result.data;
      // Honest ML confidence: derived from the model's own held-out R² (>0),
      // clamped into [0..95]. Missing R² means the model could not evaluate
      // itself on this history — report it as low-confidence, never invented.
      const r2 = d.r2_score;
      const confidence = Number.isFinite(r2) && r2 > 0
        ? Math.max(1, Math.min(95, Math.round(r2 * 100)))
        : 50;
      const isLowConfidence = confidence < 80; // aligns with frontend badge tiers
      const response = {
        success: true,
        forecast_source: 'ml',
        spending_history: history,
        predicted_spending: d.predicted_spending,
        trend_direction: d.trend_direction,
        mae: d.mae,
        rmse: d.rmse,
        r2_score: d.r2_score,
        confidence,
        is_low_confidence: isLowConfidence,
        ...(isLowConfidence && d.r2_score === null
          ? { message: 'ML forecast with low model fit quality on available history.' }
          : {}),
      };
      console.log(JSON.stringify({
        event: 'forecast_ml_success',
        handler: 'getNextMonthForecast',
        attempts,
        forecast_source: 'ml',
        confidence,
      }));
      return res.json(response);
    }

    console.log(JSON.stringify({
      event: 'forecast_ml_fallback',
      handler: 'getNextMonthForecast',
      category: result.failure.category,
      detail: result.failure.messageDetail,
      attempts,
    }));
    return res.json(buildFallbackResponse(history, result.failure));

  } catch (err) {
    console.error(JSON.stringify({
      event: 'forecast_error',
      handler: 'getNextMonthForecast',
      category: 'server_error',
      detail: err.message,
    }));

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
