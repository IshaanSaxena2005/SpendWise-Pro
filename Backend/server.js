require('dotenv').config();
const cookieParser = require('cookie-parser');
const cors = require('cors');
const express = require('express');
const fs = require('fs/promises');
const helmet = require('helmet');
const path = require('path');
const pool = require('./config/db');
const authRoutes = require('./routes/auth');
const userRoutes = require('./routes/user');
const expenseRoutes = require('./routes/expense');
const categoryRoutes = require('./routes/category');
const budgetRoutes = require('./routes/budget');
const analyticsRoutes = require('./routes/analytics');
const healthRoutes = require('./routes/health');
const predictionRoutes = require('./routes/prediction');
const forecastRoutes = require('./routes/forecast');
const intelligenceRoutes = require('./routes/intelligence');
const notificationRoutes = require('./routes/notifications');
const aiRoutes = require('./routes/ai');
const anomalyRoutes = require('./routes/anomaly');
const goalRoutes   = require('./routes/goal');
const recurringRoutes = require('./routes/recurring');
const emailRoutes = require('./routes/email');
const reportRoutes = require('./routes/reports');

const app = express();
app.set('trust proxy', 1);
const devOrigins = process.env.NODE_ENV === 'production' ? [] : ['http://localhost:5173', 'http://127.0.0.1:5173'];
const allowedOrigins = [
  process.env.FRONTEND_URL,
  ...(process.env.CORS_ORIGIN || '').split(','),
  ...devOrigins,
]
  .filter(Boolean)
  .map(origin => origin.trim().replace(/\/$/, ''));

app.use(helmet({
  contentSecurityPolicy: false,
  crossOriginResourcePolicy: { policy: 'cross-origin' },
}));

app.use(cors({
  origin(origin, callback) {
    const normalizedOrigin = origin?.replace(/\/$/, '');
    if (!normalizedOrigin || allowedOrigins.includes(normalizedOrigin)) {
      callback(null, true);
      return;
    }

    console.error(`[CORS Blocked] Origin: "${origin}" (normalized: "${normalizedOrigin}"). Allowed origins:`, allowedOrigins);
    callback(new Error('Not allowed by CORS'));
  },
  credentials: true
}));
const PORT = process.env.PORT || 3000;

app.use(express.json());
app.use(cookieParser());
app.use((err, req, res, next) => {
  if (err instanceof SyntaxError && err.status === 400 && 'body' in err) {
    return res.status(400).json({
      success: false,
      message: 'Invalid JSON payload.',
    });
  }

  next(err);
});
app.use('/uploads', express.static(path.join(__dirname, 'uploads')));
app.use('/api/auth', authRoutes);
app.use('/api/user', userRoutes);
app.use('/api/expenses', expenseRoutes);
app.use('/api/categories', categoryRoutes);
app.use('/api/budgets', budgetRoutes);
app.use('/api/analytics', analyticsRoutes);
app.use('/api/health', healthRoutes);
app.use('/api/predictions', predictionRoutes);
app.use('/api/forecast', forecastRoutes);
app.use('/api/intelligence', intelligenceRoutes);
app.use('/api/notifications', notificationRoutes);
app.use('/api/ai', aiRoutes);
app.use('/api/anomaly', anomalyRoutes);
app.use('/api/goals',  goalRoutes);
app.use('/api/recurring', recurringRoutes);
app.use('/api/email', emailRoutes);
app.use('/api/reports', reportRoutes);

app.get('/api/health', async (req, res) => {
  try {
    await pool.query('SELECT 1');
    res.status(200).json({ success: true, status: 'healthy', db: 'connected' });
  } catch (err) {
    res.status(503).json({ success: false, status: 'unhealthy', db: 'disconnected', error: err.message });
  }
});

app.get('/test-db', async (req, res) => {
  try {
    const [rows] = await pool.query('SELECT NOW() AS now');
    res.json(rows[0]);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

async function start() {
  console.log("Before schema initialization");
  await fs.mkdir(path.join(__dirname, 'uploads', 'avatars'), { recursive: true });
  
  const [usersCheck] = await pool.query("SHOW TABLES LIKE 'users'");
  if (usersCheck.length === 0) {
    console.log('Schema initialization started');
    const schemaSql = await fs.readFile(path.join(__dirname, 'schema', 'schema.sql'), 'utf8');
    await pool.query(schemaSql);
    console.log('Schema initialization completed');
  }

  console.log("After schema initialization");
  await pool.query(`
    CREATE TABLE IF NOT EXISTS profile_photos (
      id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
      user_id BIGINT UNSIGNED NOT NULL UNIQUE,
      file_path VARCHAR(255) NOT NULL,
      uploaded_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      CONSTRAINT fk_profile_photo_user
        FOREIGN KEY (user_id)
        REFERENCES users(id)
        ON DELETE CASCADE
    ) ENGINE=InnoDB
  `);
  await pool.query(`
    CREATE TABLE IF NOT EXISTS user_notification_preferences (
      user_id BIGINT UNSIGNED NOT NULL PRIMARY KEY,
      budget_alerts BOOLEAN NOT NULL DEFAULT TRUE,
      overspending_warnings BOOLEAN NOT NULL DEFAULT TRUE,
      ai_forecasts BOOLEAN NOT NULL DEFAULT TRUE,
      email_reports BOOLEAN NOT NULL DEFAULT FALSE,
      updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      CONSTRAINT fk_notification_preferences_user FOREIGN KEY (user_id)
        REFERENCES users(id) ON DELETE CASCADE
    ) ENGINE=InnoDB
  `);
  for (const migration of [
    "ALTER TABLE users ADD COLUMN auth_provider VARCHAR(20) NOT NULL DEFAULT 'email'",
    'ALTER TABLE users ADD COLUMN has_local_password BOOLEAN NOT NULL DEFAULT TRUE',
    'ALTER TABLE users ADD COLUMN verification_token_expires_at TIMESTAMP NULL',
  ]) {
    try {
      await pool.query(migration);
    } catch (err) {
      if (err.code !== 'ER_DUP_FIELDNAME') throw err;
    }
  }
  try {
    await pool.query('ALTER TABLE categories ADD COLUMN icon VARCHAR(16) NULL AFTER name');
  } catch (err) {
    if (err.code !== 'ER_DUP_FIELDNAME') {
      throw err;
    }
  }
  // ── Goals table (idempotent migration) ────────────────────────────────────
  await pool.query(`
    CREATE TABLE IF NOT EXISTS goals (
      id                   BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
      user_id              BIGINT UNSIGNED NOT NULL,
      name                 VARCHAR(255)    NOT NULL,
      icon                 VARCHAR(10)     NULL,
      category             VARCHAR(100)    NULL,
      target_amount        DECIMAL(12,2)   NOT NULL,
      saved_amount         DECIMAL(12,2)   NOT NULL DEFAULT 0,
      monthly_contribution DECIMAL(12,2)   NOT NULL DEFAULT 0,
      target_date          DATE            NOT NULL,
      priority             ENUM('High','Medium','Low') NOT NULL DEFAULT 'Medium',
      notes                TEXT            NULL,
      is_completed         BOOLEAN         NOT NULL DEFAULT FALSE,
      created_at           TIMESTAMP       DEFAULT CURRENT_TIMESTAMP,
      updated_at           TIMESTAMP       DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      CONSTRAINT fk_goals_user
        FOREIGN KEY (user_id) REFERENCES users(id)
        ON DELETE CASCADE
    ) ENGINE=InnoDB
  `);

  // ── Email events log (idempotent migration) ───────────────────────────────
  // Guarantees a given notification email is sent at most once per user per
  // event. The UNIQUE(user_id, event_key) constraint powers the dedup: an
  // INSERT IGNORE that affects 0 rows means the email was already sent.
  await pool.query(`
    CREATE TABLE IF NOT EXISTS email_events (
      id         BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
      user_id    BIGINT UNSIGNED NOT NULL,
      event_key  VARCHAR(191)    NOT NULL,
      created_at TIMESTAMP       DEFAULT CURRENT_TIMESTAMP,
      UNIQUE KEY uniq_user_event (user_id, event_key),
      CONSTRAINT fk_email_events_user
        FOREIGN KEY (user_id) REFERENCES users(id)
        ON DELETE CASCADE
    ) ENGINE=InnoDB
  `);

  // ── Refresh tokens table (idempotent migration) ─────────────────────────────
  await pool.query(`
    CREATE TABLE IF NOT EXISTS refresh_tokens (
      id         BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
      user_id    BIGINT UNSIGNED NOT NULL,
      token_hash VARCHAR(255)    NOT NULL,
      expires_at TIMESTAMP       NOT NULL,
      created_at TIMESTAMP       DEFAULT CURRENT_TIMESTAMP,
      UNIQUE KEY uniq_refresh_token (token_hash),
      CONSTRAINT fk_refresh_user
        FOREIGN KEY (user_id) REFERENCES users(id)
        ON DELETE CASCADE
    ) ENGINE=InnoDB
  `);

  await pool.query('SELECT 1');
  if (process.env.NODE_ENV !== 'production') {
    console.warn('Database connection verified');
  }

  console.log("Before app.listen");


  // Start server
  app.listen(PORT, '0.0.0.0', () => {
    console.log(`Server listening on ${PORT}`);
    if (process.env.NODE_ENV !== 'production') {
      console.warn(`Server listening on http://localhost:${PORT}`);
    }
  });
}

start().catch((err) => {
  console.error('Database connection failed:', err.message);
  process.exit(1);
});
