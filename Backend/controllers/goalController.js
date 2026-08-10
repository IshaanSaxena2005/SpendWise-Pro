const pool = require('../config/db');
const { DEMO_EMAIL } = require('../config/constants');

const DEMO_GOALS = [
  {
    id: 1, user_id: 0,
    name: 'iPhone 16 Pro', title: 'iPhone 16 Pro', icon: '📱', category: 'Technology',
    target_amount: 110000, saved_amount: 62000, monthly_contribution: 7500,
    target_date: '2026-12-31', priority: 'High',
    notes: 'Latest iPhone with Pro camera system',
    is_completed: false,
    created_at: '2026-01-15T00:00:00Z', updated_at: '2026-07-01T00:00:00Z',
  },
  {
    id: 2, user_id: 0,
    name: 'Japan Trip', title: 'Japan Trip', icon: '✈️', category: 'Travel',
    target_amount: 85000, saved_amount: 28000, monthly_contribution: 4000,
    target_date: '2027-03-31', priority: 'Medium',
    notes: 'Cherry blossom season — March / April',
    is_completed: false,
    created_at: '2026-02-01T00:00:00Z', updated_at: '2026-07-01T00:00:00Z',
  },
  {
    id: 3, user_id: 0,
    name: 'Emergency Fund', title: 'Emergency Fund', icon: '🛡️', category: 'Emergency',
    target_amount: 150000, saved_amount: 95000, monthly_contribution: 10000,
    target_date: '2026-09-30', priority: 'High',
    notes: '6 months of living expenses covered',
    is_completed: false,
    created_at: '2025-12-01T00:00:00Z', updated_at: '2026-07-01T00:00:00Z',
  },
  {
    id: 4, user_id: 0,
    name: 'MacBook Pro M4', title: 'MacBook Pro M4', icon: '💻', category: 'Technology',
    target_amount: 200000, saved_amount: 15000, monthly_contribution: 2500,
    target_date: '2027-12-31', priority: 'Low',
    notes: 'For development and video editing',
    is_completed: false,
    created_at: '2026-03-01T00:00:00Z', updated_at: '2026-07-01T00:00:00Z',
  },
];

function enrichGoal(goal) {
  const current_amount = Number(goal.current_amount !== undefined ? goal.current_amount : goal.saved_amount) || 0;
  const target_amount = Number(goal.target_amount) || 1;
  const progress_percentage = Math.min(100, Number(((current_amount / target_amount) * 100).toFixed(1)));
  
  // Calculate status
  let status = 'Active';
  if (goal.is_completed || progress_percentage >= 100) {
    status = 'Completed';
  } else if (new Date(goal.target_date) < new Date()) {
    status = 'Overdue';
  }

  // AI insights calculations
  const remaining = Math.max(0, target_amount - current_amount);
  const monthly = Number(goal.monthly_contribution) || 0;
  
  // Months remaining to target date
  const now = new Date();
  const target = new Date(goal.target_date);
  const monthsRemaining = Math.max(0.1, (target.getFullYear() - now.getFullYear()) * 12 + (target.getMonth() - now.getMonth()));
  const amountNeededPerMonth = Math.max(0, Number((remaining / monthsRemaining).toFixed(2)));

  let estimatedCompletionDate = 'Never (No contributions)';
  let probability = 'Low';
  let suggestions = [];

  if (progress_percentage >= 100) {
    estimatedCompletionDate = 'Completed';
    probability = 'High';
  } else if (monthly > 0) {
    const monthsNeeded = Math.ceil(remaining / monthly);
    const estDate = new Date();
    estDate.setMonth(estDate.getMonth() + monthsNeeded);
    estimatedCompletionDate = estDate.toISOString().split('T')[0];

    // Probability
    if (monthly >= amountNeededPerMonth) {
      probability = 'High';
    } else if (monthly >= amountNeededPerMonth * 0.7) {
      probability = 'Medium';
    } else {
      probability = 'Low';
    }
  }

  if (status === 'Overdue') {
    probability = 'Low';
    suggestions.push('The target date has passed. Consider extending the target date or increasing your savings rate.');
  } else if (probability === 'Low' && progress_percentage < 100) {
    const gap = amountNeededPerMonth - monthly;
    suggestions.push(`Increase monthly savings by ₹${Math.floor(gap).toLocaleString('en-IN')} to get back on track.`);
    suggestions.push('Consider reviewing discretionary spending categories like Dining out or Shopping.');
  } else if (probability === 'Medium') {
    suggestions.push('You are slightly behind schedule. A minor boost of 10% to your savings rate will ensure on-time completion.');
  } else if (status === 'Active') {
    suggestions.push('Keep up the good work! You are currently on track to achieve this goal.');
  }

  return {
    ...goal,
    title: goal.name || goal.title,
    current_amount,
    saved_amount: current_amount, // for backward compatibility in widgets
    manual_saved_amount: Number(goal.manual_saved_amount !== undefined ? goal.manual_saved_amount : goal.saved_amount) || 0,
    linked_amount: Number(goal.linked_amount) || 0,
    linked_count: Number(goal.linked_count) || 0,
    progress_percentage,
    status,
    is_completed: (goal.is_completed || progress_percentage >= 100) ? 1 : 0,
    ai_insights: {
      estimated_completion_date: estimatedCompletionDate,
      amount_needed_per_month: amountNeededPerMonth,
      probability_of_completion: probability,
      suggestions
    }
  };
}

const getGoals = async (req, res) => {
  try {
    if (req.user.email === DEMO_EMAIL) {
      return res.json({ success: true, goals: DEMO_GOALS.map(enrichGoal) });
    }

    const [goals] = await pool.query(
      `SELECT g.id, g.user_id, g.name AS title, g.name, g.icon, g.category,
              g.target_amount,
              (g.saved_amount + COALESCE((SELECT SUM(amount) FROM expenses WHERE goal_id = g.id), 0)) AS current_amount,
              g.saved_amount,
              g.saved_amount AS manual_saved_amount,
              COALESCE((SELECT SUM(amount) FROM expenses WHERE goal_id = g.id), 0) AS linked_amount,
              (SELECT COUNT(*) FROM expenses WHERE goal_id = g.id) AS linked_count,
              g.monthly_contribution,
              DATE_FORMAT(g.target_date, '%Y-%m-%d') AS target_date,
              g.priority, g.notes, g.is_completed, g.created_at, g.updated_at
       FROM goals g
       WHERE g.user_id = ?
       ORDER BY g.is_completed ASC, FIELD(g.priority, 'High', 'Medium', 'Low'), g.created_at DESC`,
      [req.user.id],
    );

    res.json({ success: true, goals: goals.map(enrichGoal) });
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
      name, title, icon, category,
      target_amount, saved_amount = 0, monthly_contribution = 0,
      target_date, priority = 'Medium', notes,
    } = req.body;

    const finalName = (name || title || '').trim();

    if (!finalName || !target_amount || !target_date) {
      return res.status(400).json({
        success: false,
        message: 'name/title, target_amount and target_date are required.',
      });
    }

    const [result] = await pool.query(
      `INSERT INTO goals
         (user_id, name, icon, category, target_amount, saved_amount,
          monthly_contribution, target_date, priority, notes)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        req.user.id,
        finalName,
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
      `SELECT g.id, g.name, g.target_amount, 
              (g.saved_amount + COALESCE((SELECT SUM(amount) FROM expenses WHERE goal_id = g.id), 0)) AS current_amount
       FROM goals g 
       WHERE g.id = ? AND g.user_id = ?`,
      [id, userId],
    );

    if (existing.length === 0) {
      return res.status(404).json({ success: false, message: 'Goal not found' });
    }

    const {
      name, title, icon, category,
      target_amount, saved_amount, monthly_contribution,
      target_date, priority, notes, is_completed,
    } = req.body;

    const fields = [];
    const values = [];

    const finalName = name || title;
    if (finalName !== undefined) { fields.push('name = ?'); values.push(finalName.trim()); }
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
      const effectiveName   = finalName !== undefined ? finalName : existing[0].name;
      const oldPct = (existing[0].current_amount / existing[0].target_amount) * 100;
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
        } else if (newPct >= 25 && oldPct < 25) {
          await pool.query(
            `INSERT INTO notifications (user_id, title, description, type) VALUES (?, ?, ?, ?)`,
            [userId, '📈 Goal 25% Complete', `You've reached 25% of your target for "${effectiveName}"!`, 'goal_milestone'],
          );
        }

        // Detect if goal is behind schedule and notify
        const enriched = enrichGoal({ ...existing[0], saved_amount, target_amount: effectiveTarget, target_date });
        if (enriched.status === 'Active' && enriched.ai_insights.probability_of_completion === 'Low') {
          await pool.query(
            `INSERT INTO notifications (user_id, title, description, type) VALUES (?, ?, ?, 'goal_behind')`,
            [userId, '⚠️ Goal Behind Schedule', `Your goal "${effectiveName}" is behind schedule. AI recommends increasing contributions.`, 'goal_behind']
          );
        }

        if (remaining > 0 && remaining <= 10000 && (existing[0].target_amount - existing[0].current_amount) > 10000) {
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
