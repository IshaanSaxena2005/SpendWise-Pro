const pool = require('../config/db');
const { DEMO_EMAIL } = require('../config/constants');

function normalizeBudgetMonth(value) {
  if (value === null || value === undefined || value === '') {
    return value;
  }

  const str = String(value).trim();
  const isoMatch = str.match(/^(\d{4})-(\d{2})/);
  if (isoMatch) {
    return `${isoMatch[1]}-${isoMatch[2]}-01`;
  }

  const dmyMatch = str.match(/^(\d{2})-(\d{2})-(\d{4})$/);
  if (dmyMatch) {
    return `${dmyMatch[3]}-${dmyMatch[2]}-01`;
  }

  const parsed = new Date(str);
  if (!Number.isNaN(parsed.getTime())) {
    const year = parsed.getFullYear();
    const month = String(parsed.getMonth() + 1).padStart(2, '0');
    return `${year}-${month}-01`;
  }

  return str;
}

/**
 * Budget carry-forward: when the user starts using a new month, seed its
 * defaults from the most recent earlier month that actually has budgets.
 *
 * Safety properties:
 *  - Only rows MISSING for the current month are inserted (NULL-safe anti-join
 *    with `<=>`, so the Overall budget (category_id IS NULL) participates in
 *    the same match as per-category rows). Existing current-month budgets —
 *    whether carried earlier or edited by the user — are never overwritten.
 *  - Only the server's CURRENT month is ever written: historical months stay
 *    untouched and no future months are ever created.
 *  - Idempotent + race-safe: the UNIQUE key (user_id, category_id, month)
 *    backstops the anti-join, so two concurrent callers can at worst make one
 *    INSERT hit ER_DUP_ENTRY, which is treated as "already done".
 *  - Never invents budgets: if the user has no earlier budgets at all, or none
 *    beyond what already exists this month, zero rows are inserted.
 *  - Month-to-month chain: whatever the user's most recent month contains
 *    (including their edits) becomes the next month's defaults.
 */
function getMonthStart(date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-01`;
}

// Mirrors Backend/migrations/008_create_budget_carryforward_state.sql.
// Ensured lazily on first use so the feature is self-healing even if the
// startup migration has not run yet (idempotent: CREATE TABLE IF NOT EXISTS).
const CARRYFORWARD_STATE_TABLE_SQL = `
  CREATE TABLE IF NOT EXISTS budget_carryforward_state (
      user_id BIGINT UNSIGNED NOT NULL,
      month DATE NOT NULL,
      handled_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      PRIMARY KEY (user_id, month),
      CONSTRAINT fk_bcfs_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
  ) ENGINE=InnoDB`;
let carryStateTableEnsured = false;

const ensureCarryForwardStateTable = async () => {
  if (carryStateTableEnsured) return;
  await pool.query(CARRYFORWARD_STATE_TABLE_SQL);
  carryStateTableEnsured = true;
};

const carryForwardDefaultBudgets = async (userId) => {
  await ensureCarryForwardStateTable();

  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();

    const currentMonth = getMonthStart(new Date());

    // Claim this (user, month) once. If the claim already exists, carry-forward
    // has already run for this month — do NOT re-seed, so budgets the user
    // deleted or edited this month are never silently restored/overwritten.
    const [claim] = await conn.query(
      'INSERT IGNORE INTO budget_carryforward_state (user_id, month) VALUES (?, ?)',
      [userId, currentMonth]
    );
    if ((claim?.affectedRows || 0) === 0) {
      await conn.commit();
      return 0; // already handled this month
    }

    // Most recent month (before the current one) that has any budgets for this user.
    const [source] = await conn.query(
      `SELECT DATE_FORMAT(MAX(month), '%Y-%m-%d') AS srcMonth
       FROM budgets
       WHERE user_id = ? AND month < ?`,
      [userId, currentMonth]
    );
    const srcMonth = source?.[0]?.srcMonth;
    let created = 0;

    if (srcMonth) {
      // Copy only rows MISSING for the current month (NULL-safe anti-join with
      // `<=>` so the Overall budget participates too). The UNIQUE key
      // (user_id, category_id, month) backstops concurrent creates.
      const [result] = await conn.query(
        `INSERT INTO budgets (user_id, category_id, month, amount_limit)
         SELECT p.user_id, p.category_id, ?, p.amount_limit
         FROM budgets p
         LEFT JOIN budgets t
           ON t.user_id = p.user_id
          AND t.month = ?
          AND t.category_id <=> p.category_id
         WHERE p.user_id = ?
           AND p.month = ?
           AND t.id IS NULL`,
        [currentMonth, currentMonth, userId, srcMonth]
      );
      created = result?.affectedRows || 0;
    }

    // Claim + seed commit atomically: a failed seed leaves no claim, so the
    // next fetch retries cleanly; a committed claim means never re-seed.
    await conn.commit();
    return created;
  } catch (err) {
    await conn.rollback();
    if (err.code === 'ER_DUP_ENTRY') {
      return 0; // a concurrent create/carry-forward filled the gap
    }
    throw err;
  } finally {
    conn.release();
  }
};

const createBudget = async (req, res) => {
  try {
    if (req.user.email === DEMO_EMAIL) {
      return res.status(403).json({
        success: false,
        message: 'Demo mode is read-only. Create your own account to manage personal finances.'
      });
    }

    const userId = req.user.id;
    const { category_id, amount_limit } = req.body;
    const categoryId = category_id ?? null;
    const month = normalizeBudgetMonth(req.body.month);

    if (categoryId) {
      const [categories] = await pool.query(
        'SELECT id FROM categories WHERE id = ? AND user_id = ?',
        [categoryId, userId]
      );

      if (categories.length === 0) {
        return res.status(400).json({
          success: false,
          message: 'Invalid category',
        });
      }
    } else {
      const [existing] = await pool.query(
        'SELECT id FROM budgets WHERE user_id = ? AND category_id IS NULL AND month = ?',
        [userId, month]
      );

      if (existing.length > 0) {
        return res.status(409).json({
          success: false,
          message: 'Overall budget for this month already exists',
        });
      }
    }

    await pool.query(
      'INSERT INTO budgets (user_id, category_id, month, amount_limit) VALUES (?, ?, ?, ?)',
      [userId, categoryId, month, amount_limit]
    );

    res.json({
      success: true,
      message: 'Budget created',
    });
  } catch (err) {
    if (err.code === 'ER_DUP_ENTRY') {
      return res.status(409).json({
        success: false,
        message: 'Budget already exists for this category and month',
      });
    }

    res.status(500).json({
      success: false,
      message: err.message,
    });
  }
};

const getBudgets = async (req, res) => {
  try {
    const userId = req.user.id;

    // Ensure this month's default budgets exist (carry-forward from the most
    // recent earlier month). Best-effort: a failure here must never block
    // listing budgets. Skipped for the shared read-only demo account.
    if (req.user.email !== DEMO_EMAIL) {
      try {
        const created = await carryForwardDefaultBudgets(userId);
        if (created > 0) {
          console.log(`[budgets] carry-forward: created ${created} default budget(s) for user ${userId}`);
        }
      } catch (carryErr) {
        console.error('[budgets] carry-forward failed:', carryErr.message);
      }
    }

    const [budgets] = await pool.query(
      `SELECT
        b.id,
        b.user_id,
        b.category_id,
        c.name AS category_name,
        DATE_FORMAT(b.month, '%Y-%m-%d') AS month,
        b.amount_limit,
        b.created_at,
        b.updated_at
      FROM budgets b
      LEFT JOIN categories c ON c.id = b.category_id
      WHERE b.user_id = ?
      ORDER BY b.month DESC, b.id DESC`,
      [userId]
    );

    res.json({
      success: true,
      budgets,
    });
  } catch (err) {
    res.status(500).json({
      success: false,
      message: err.message,
    });
  }
};

const updateBudget = async (req, res) => {
  try {
    if (req.user.email === DEMO_EMAIL) {
      return res.status(403).json({
        success: false,
        message: 'Demo mode is read-only. Create your own account to manage personal finances.'
      });
    }

    const userId = req.user.id;
    const { id } = req.params;
    const { category_id, amount_limit } = req.body;
    const categoryId = category_id ?? null;
    const normalizedMonth = normalizeBudgetMonth(req.body.month);

    if (categoryId) {
      const [categories] = await pool.query(
        'SELECT id FROM categories WHERE id = ? AND user_id = ?',
        [categoryId, userId]
      );

      if (categories.length === 0) {
        return res.status(400).json({
          success: false,
          message: 'Invalid category',
        });
      }
    } else {
      const [existing] = await pool.query(
        'SELECT id FROM budgets WHERE user_id = ? AND category_id IS NULL AND month = ? AND id != ?',
        [userId, normalizedMonth, id]
      );

      if (existing.length > 0) {
        return res.status(409).json({
          success: false,
          message: 'Overall budget for this month already exists',
        });
      }
    }

    const [result] = await pool.query(
      'UPDATE budgets SET category_id = ?, month = ?, amount_limit = ? WHERE id = ? AND user_id = ?',
      [categoryId, normalizedMonth, amount_limit, id, userId]
    );

    if (result.affectedRows === 0) {
      return res.status(404).json({
        success: false,
        message: 'Budget not found',
      });
    }

    res.json({
      success: true,
      message: 'Budget updated',
    });
  } catch (err) {
    if (err.code === 'ER_DUP_ENTRY') {
      return res.status(409).json({
        success: false,
        message: 'Budget already exists for this category and month',
      });
    }

    res.status(500).json({
      success: false,
      message: err.message,
    });
  }
};

const deleteBudget = async (req, res) => {
  try {
    if (req.user.email === DEMO_EMAIL) {
      return res.status(403).json({
        success: false,
        message: 'Demo mode is read-only. Create your own account to manage personal finances.'
      });
    }

    const userId = req.user.id;
    const { id } = req.params;

    const [result] = await pool.query(
      'DELETE FROM budgets WHERE id = ? AND user_id = ?',
      [id, userId]
    );

    if (result.affectedRows === 0) {
      return res.status(404).json({
        success: false,
        message: 'Budget not found',
      });
    }

    res.json({
      success: true,
      message: 'Budget deleted',
    });
  } catch (err) {
    res.status(500).json({
      success: false,
      message: err.message,
    });
  }
};

const carryForwardBudgets = async (req, res) => {
  try {
    if (req.user.email === DEMO_EMAIL) {
      return res.status(403).json({
        success: false,
        message: 'Demo mode is read-only. Create your own account to manage personal finances.'
      });
    }

    const created = await carryForwardDefaultBudgets(req.user.id);

    res.json({
      success: true,
      message: created > 0 ? `Created ${created} default budget(s) for this month` : 'Budgets already up to date',
      created,
    });
  } catch (err) {
    res.status(500).json({
      success: false,
      message: err.message,
    });
  }
};

module.exports = {
  createBudget,
  getBudgets,
  updateBudget,
  deleteBudget,
  carryForwardBudgets,
};
