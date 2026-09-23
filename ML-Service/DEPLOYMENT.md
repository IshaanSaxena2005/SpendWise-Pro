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
| `ML_SERVICE_URL` | `https://<your-ml-service>.onrender.com` |
| `ML_API_KEY` | the **same** secret as the ML service |

Restart the backend service, then verify live categorization uses ML through
arbitration: the categorize API response carries `source: "ml" | "keyword" |
"learning" | ...` and `categorizeService.js` logs one `[Categorize]` line per
request. Learning must still win for merchants the user has corrected.

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
