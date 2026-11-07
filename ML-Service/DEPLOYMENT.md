# ML-Service Production Deployment Guide (Phase 4)

## Overview

The ML-Service deploys as an **independent, stateless, DB-less web service**.
The production Node backend connects to it via two environment variables.
No code changes are required to deploy — only platform configuration.

```
Frontend (Vercel)
    ↓
Backend (Node/Express)
    ↓  POST {ML_SERVICE_URL}/categorize   + header: x-ml-api-key
ML-Service (Render web service)
```

## Current production deployment (verified live)

- **ML service URL:** `https://spendwise-ml-service-11w7.onrender.com`
- Deployed on Render, root directory `ML-Service`, gunicorn via `Procfile`,
  health check path `/health`.
- Verified live (Phase 4 matrix): `/health` 200 unauthenticated, `/categorize`
  and `/anomaly` 401 without/with-wrong key, 200 with correct key,
  `/forecast` 200 → `{predicted_spending, trend_direction, mae, rmse, r2_score}`.
- **Cold start warning:** on the free tier the service spins down when idle
  and takes **~50s** to come back (measured). The Node backend's first 4s
  attempt will time out during a cold start; the forecast controller retries
  once with a 55s budget for exactly this case. If forecasts must respond
  instantly, use a paid Render instance type that never sleeps.
- `ML_API_KEY` must be the **same secret** on BOTH the ML service and the
  Node backend (Render dashboard → each service → Environment). The key is
  never committed to the repo — check the ML service's own environment for
  the current authoritative value.

## Recommended platform: Render

Render builds Python services from a repo subdirectory, honors the existing
`Procfile`, injects `$PORT`, and supports unauthenticated health checks —
no extra config file is needed.

> The backend already runs on Render (see `diagnose-production.js`).
> Deploying the ML service there too keeps the platform surface small, and
> the ML service is NOT nested under the frontend's Vercel project.

### Step 1 — Create the web service

1. Render Dashboard → **New → Web Service** → connect this Git repository.
2. Settings:
   - **Root Directory:** `ML-Service`
   - **Runtime:** Python 3
   - **Build Command:** `pip install -r requirements.txt`
   - **Start Command:** taken from `ML-Service/Procfile` (gunicorn `app:app`)
   - **Instance:** Free is sufficient to start (cold starts possible)
3. **Health Check Path:** `/health`

### Step 2 — Environment variables (ML service)

| Key | Value |
|---|---|
| `ML_API_KEY` | a strong random secret (see below) |
| `DEBUG` | `false` |

Never commit the real secret. Generate one:

```bash
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```

### Step 3 — Verify the deployment

```bash
curl https://<your-ml-service>.onrender.com/health
# -> {"status":"healthy"}

# full matrix (health, auth rejection, 8 categorize examples, forecast, anomaly):
cd Backend
ML_SERVICE_URL=https://<your-ml-service>.onrender.com \
ML_API_KEY=<same secret> \
node scripts/verify_ml_deployment.js
```

All 7 checks must pass before wiring the backend.

## Backend connection (Step 4)

Set on the **Backend** service's environment (Render dashboard — no code change):

| Key | Value |
|---|---|
| `ML_SERVICE_URL` | `https://spendwise-ml-service-11w7.onrender.com` (no `/forecast` suffix, no trailing slash needed) |
| `ML_API_KEY` | the **same** secret as the ML service |

Restart the backend service, then verify live categorization uses ML through
arbitration: the categorize API response carries `source: "ml" | "keyword" |
"learning" | ...` and `categorizeService.js` logs one `[Categorize]` line per
request. Learning must still win for merchants the user has corrected.

## Backend forecast integration specifics

`Backend/controllers/forecastController.js` connects to this service:

- Endpoint: `POST {ML_SERVICE_URL}/forecast` — the controller rejects a
  `ML_SERVICE_URL` that already ends in `/forecast` (would double the
  suffix) or points to `localhost` (can never resolve from a hosted backend).
- Header: `x-ml-api-key`.
- Payload: `{ "history": [monthly_total, ...] }` (≥3 numeric months required).
- Response contract: `{predicted_spending, trend_direction, mae, rmse,
  r2_score}` — validated by the controller before use; malformed responses
  fall back to the historical average rather than displaying garbage.
- Failures are classified in the Render backend logs as structured
  `forecast_ml_fallback` events (`ml_auth_failed` / `ml_timeout` /
  `ml_dns_failure` / `ml_route_not_found` / `ml_invalid_response` …) so a
  401 key mismatch is never mistaken for "service unreachable". Values of
  the API key, financial history, and user identifiers are never logged.
- Fallback: historical average with honest low confidence (data-scarcity
  formula, ≤50%) and `forecast_source: "average_fallback"`; the dashboard
  labels it "Low-Confidence Estimate"/"Average-Based Estimate", never as
  model confidence.

## Notes

- `/health` is intentionally unauthenticated (platform health checks) and
  returns only `{"status":"healthy"}` — no env, keys, or model data.
- `scikit-learn` is pinned (`requirements.txt`) to the version the committed
  artifacts were pickled with — do not bump it casually (unpickle warnings +
  gate-comparison drift).
- Artifacts (`artifacts/*.joblib`) ship with the repo; the service loads them
  at boot and does not retrain in production (training only happens if
  artifacts are missing — that path is a safety net, not normal operation).
- `model_metadata.json` records the incumbent's measured metrics (F1 0.9501 /
  acc 0.9500 on the reproducible holdout) and is consumed by the Phase 3
  candidate-vs-incumbent gate.
