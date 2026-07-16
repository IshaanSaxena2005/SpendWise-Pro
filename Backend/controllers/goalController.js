const pool = require('../config/db');
const { DEMO_EMAIL } = require('../config/constants');

const DEMO_GOALS = [
  {
    id: 1, user_id: 0,
    name: 'iPhone 16 Pro', icon: '📱', category: 'Technology',
    target_amount: 110000, saved_amount: 62000, monthly_contribution: 7500,
    target_date: '2026-12-31', priority: 'High',
    notes: 'Latest iPhone with Pro camera system',
    is_completed: false,
    created_at: '2026-01-15T00:00:00Z', updated_at: '2026-07-01T00:00:00Z',
  },
  {
    id: 2, user_id: 0,
    name: 'Japan Trip', icon: '✈️', category: 'Travel',
    target_amount: 85000, saved_amount: 28000, monthly_contribution: 4000,
    target_date: '2027-03-31', priority: 'Medium',
    notes: 'Cherry blossom season — March / April',
    is_completed: false,
    created_at: '2026-02-01T00:00:00Z', updated_at: '2026-07-01T00:00:00Z',
  },
  {
    id: 3, user_id: 0,
    name: 'Emergency Fund', icon: '🛡️', category: 'Emergency',
    target_amount: 150000, saved_amount: 95000, monthly_contribution: 10000,
    target_date: '2026-09-30', priority: 'High',
    notes: '6 months of living expenses covered',
    is_completed: false,
    created_at: '2025-12-01T00:00:00Z', updated_at: '2026-07-01T00:00:00Z',
  },
  {
    id: 4, user_id: 0,
    name: 'MacBook Pro M4', icon: '💻', category: 'Technology',
    target_amount: 200000, saved_amount: 15000, monthly_contribution: 2500,
    target_date: '2027-12-31', priority: 'Low',
    notes: 'For development and video editing',
    is_completed: false,
    created_at: '2026-03-01T00:00:00Z', updated_at: '2026-07-01T00:00:00Z',
  },
];

const getGoals = async (req, res) => {
  try {
    if (req.user.email === DEMO_EMAIL) {
      return res.json({ success: true, goals: DEMO_GOALS });
    }

    const [goals] = await pool.query(
      `SELECT id, user_id, name, icon, category,
              target_amount, saved_amount, monthly_contribution,
              DATE_FORMAT(target_date, '%Y-%m-%d') AS target_date,
              priority, notes, is_completed, created_at, updated_at
       FROM goals
       WHERE user_id = ?
       ORDER BY is_completed ASC, FIELD(priority, 'High', 'Medium', 'Low'), created_at DESC`,
      [req.user.id],
    );

    res.json({ success: true, goals });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};

const createGoal = async (req, res) => {
  try {
    if (req.user.email === DEMO_EMAIL) {
      return res.status(403).json({
        success: false,
        message: 'Demo mode is read-only. Create your own account to manage personal finances.',
      });
    }

    const {
      name, icon, category,
      target_amount, saved_amount = 0, monthly_contribution = 0,
      target_date, priority = 'Medium', notes,
    } = req.body;

    if (!name || !target_amount || !target_date) {
      return res.status(400).json({
        success: false,
        message: 'name, target_amount and target_date are required.',
      });
    }

    const [result] = await pool.query(
      `INSERT INTO goals
         (user_id, name, icon, category, target_amount, saved_amount,
          monthly_contribution, target_date, priority, notes)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        req.user.id,
        name.trim(),
        icon || null,
        category || null,
        target_amount,
        saved_amount || 0,
        monthly_contribution || 0,
        target_date,
        priority,
        notes?.trim() || null,
      ],
    );

    res.json({ success: true, message: 'Goal created', id: result.insertId });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};

const updateGoal = async (req, res) => {
  try {
    if (req.user.email === DEMO_EMAIL) {
      return res.status(403).json({
        success: false,
        message: 'Demo mode is read-only. Create your own account to manage personal finances.',
      });
    }

    const userId = req.user.id;
    const { id } = req.params;

    // Fetch current state to compute milestone transitions
    const [existing] = await pool.query(
      'SELECT saved_amount, target_amount, name FROM goals WHERE id = ? AND user_id = ?',
      [id, userId],
    );

    if (existing.length === 0) {
      return res.status(404).json({ success: false, message: 'Goal not found' });
    }

    const {
      name, icon, category,
      target_amount, saved_amount, monthly_contribution,
      target_date, priority, notes, is_completed,
    } = req.body;

    const fields = [];
    const values = [];

    if (name !== undefined) { fields.push('name = ?'); values.push(name.trim()); }
    if (icon !== undefined) { fields.push('icon = ?'); values.push(icon); }
    if (category !== undefined) { fields.push('category = ?'); values.push(category); }
    if (target_amount !== undefined) { fields.push('target_amount = ?'); values.push(target_amount); }
    if (saved_amount !== undefined) { fields.push('saved_amount = ?'); values.push(saved_amount); }
    if (monthly_contribution !== undefined) { fields.push('monthly_contribution = ?'); values.push(monthly_contribution); }
    if (target_date !== undefined) { fields.push('target_date = ?'); values.push(target_date); }
    if (priority !== undefined) { fields.push('priority = ?'); values.push(priority); }
    if (notes !== undefined) { fields.push('notes = ?'); values.push(notes?.trim() || null); }
    if (is_completed !== undefined) { fields.push('is_completed = ?'); values.push(is_completed ? 1 : 0); }

    if (fields.length === 0) {
      return res.status(400).json({ success: false, message: 'No fields to update' });
    }

    values.push(id, userId);
    await pool.query(
      `UPDATE goals SET ${fields.join(', ')} WHERE id = ? AND user_id = ?`,
      values,
    );

    // ── Milestone notifications ────────────────────────────────────────────────
    if (saved_amount !== undefined) {
      const effectiveTarget = target_amount !== undefined ? target_amount : existing[0].target_amount;
      const effectiveName   = name !== undefined ? name : existing[0].name;
      const oldPct = (existing[0].saved_amount / existing[0].target_amount) * 100;
      const newPct = (saved_amount / effectiveTarget) * 100;
      const remaining = effectiveTarget - saved_amount;

      try {
        if (newPct >= 100 && oldPct < 100) {
          await pool.query(
            `INSERT INTO notifications (user_id, title, description, type) VALUES (?, ?, ?, ?)`,
            [userId, '🎉 Goal Completed!', `Congratulations! You've reached your "${effectiveName}" goal. Outstanding work!`, 'goal_completed'],
          );
        } else if (newPct >= 75 && oldPct < 75) {
          await pool.query(
            `INSERT INTO notifications (user_id, title, description, type) VALUES (?, ?, ?, ?)`,
            [userId, '🎯 75% Milestone Reached', `You're 75% of the way to your "${effectiveName}" goal. Keep it up!`, 'goal_milestone'],
          );
        } else if (newPct >= 50 && oldPct < 50) {
          await pool.query(
            `INSERT INTO notifications (user_id, title, description, type) VALUES (?, ?, ?, ?)`,
            [userId, '⭐ Halfway There!', `You've saved 50% towards your "${effectiveName}" goal!`, 'goal_milestone'],
          );
        }

        if (remaining > 0 && remaining <= 10000 && (existing[0].target_amount - existing[0].saved_amount) > 10000) {
          await pool.query(
            `INSERT INTO notifications (user_id, title, description, type) VALUES (?, ?, ?, ?)`,
            [userId, '💰 Almost There!', `Only ₹${Math.floor(remaining).toLocaleString('en-IN')} left to reach your "${effectiveName}" goal!`, 'goal_almost'],
          );
        }
      } catch (notifErr) {
        console.error('Notification creation error:', notifErr.message);
      }
    }

    res.json({ success: true, message: 'Goal updated' });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};

const deleteGoal = async (req, res) => {
  try {
    if (req.user.email === DEMO_EMAIL) {
      return res.status(403).json({
        success: false,
        message: 'Demo mode is read-only. Create your own account to manage personal finances.',
      });
    }

    const [result] = await pool.query(
      'DELETE FROM goals WHERE id = ? AND user_id = ?',
      [req.params.id, req.user.id],
    );

    if (result.affectedRows === 0) {
      return res.status(404).json({ success: false, message: 'Goal not found' });
    }

    res.json({ success: true, message: 'Goal deleted' });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};

module.exports = { getGoals, createGoal, updateGoal, deleteGoal };
