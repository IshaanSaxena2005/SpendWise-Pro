require('dotenv').config();
const cors = require('cors');
const express = require('express');
const pool = require('./config/db');
const authRoutes = require('./routes/auth');
const expenseRoutes = require('./routes/expense');
const categoryRoutes = require('./routes/category');
const budgetRoutes = require('./routes/budget');
const analyticsRoutes = require('./routes/analytics');
const healthRoutes = require('./routes/health');
const predictionRoutes = require('./routes/prediction');
const forecastRoutes = require('./routes/forecast');
const intelligenceRoutes = require('./routes/intelligence');
const notificationRoutes = require('./routes/notifications');

const app = express();
app.use(cors({
  origin: 'http://localhost:5173',
  credentials: true
}));
const PORT = process.env.PORT || 3000;

app.use(express.json());
app.use('/api/auth', authRoutes);
app.use('/api/expenses', expenseRoutes);
app.use('/api/categories', categoryRoutes);
app.use('/api/budgets', budgetRoutes);
app.use('/api/analytics', analyticsRoutes);
app.use('/api/health', healthRoutes);
app.use('/api/predictions', predictionRoutes);
app.use('/api/forecast', forecastRoutes);
app.use('/api/intelligence', intelligenceRoutes);
app.use('/api/notifications', notificationRoutes);

app.get('/test-db', async (req, res) => {
  try {
    const [rows] = await pool.query('SELECT NOW() AS now');
    res.json(rows[0]);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

async function start() {
  await pool.query('SELECT 1');
  console.log('Database connection verified');

  app.listen(PORT, () => {
    console.log(`Server listening on http://localhost:${PORT}`);
  });
}

start().catch((err) => {
  console.error('Database connection failed:', err.message);
  process.exit(1);
});
