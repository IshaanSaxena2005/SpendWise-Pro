const pool = require('../config/db');
const { DEMO_EMAIL } = require('../config/constants');
const {
  createRecurringSchedule,
  advancePastExecutedOccurrences,
  toIstDateString,
} = require('../services/recurringExecutionService');

// The only cadences the recurrence arithmetic understands; the create-path
// validator enforces the same set.
const FREQUENCIES = ['daily', 'weekly', 'monthly', 'yearly'];

const createRecurringTransaction = async (req, res) => {
  try {
    if (req.user.email === DEMO_EMAIL) {
      return res.status(403).json({
        success: false,
        message: 'Demo mode is read-only. Create your own account to manage personal finances.'
      });
    }

    const userId = req.user.id;
    const {
      type, amount, category_id, note, title, goal_id,
      frequency, start_date, end_date, never_ends,
      first_transaction_date, skip_first_transaction,
    } = req.body;

    // Validate category exists if provided
    if (category_id) {
      const [categories] = await pool.query(
        'SELECT id FROM categories WHERE id = ? AND user_id = ?',
        [category_id, userId]
      );
      if (categories.length === 0) {
        return res.status(400).json({
          success: false,
          message: 'Invalid category',
        });
      }
    }

    // The backend owns the whole lifecycle of a new schedule: the rule is
    // stored with its first occurrence due, and that occurrence — when it is
    // already due — is created right here, then advanced to the next one.
    // The frontend must not insert a first transaction of its own.
    const created = await createRecurringSchedule({
      userId,
      type,
      amount,
      category_id,
      note,
      title,
      goal_id,
      frequency,
      start_date,
      end_date,
      never_ends,
      first_transaction_date,
      skipFirstOccurrence: skip_first_transaction === true,
    });

    res.json({
      success: true,
      message: 'Recurring transaction created',
      id: created.id,
      firstTransaction: created.firstTransaction,
    });
  } catch (err) {
    res.status(500).json({
      success: false,
      message: err.message,
    });
  }
};

const getRecurringTransactions = async (req, res) => {
  try {
    const userId = req.user.id;

    const [recurring] = await pool.query(
      `SELECT
        rt.id,
        rt.user_id,
        rt.linked_transaction_id,
        rt.type,
        rt.amount,
        rt.category_id,
        c.name AS category_name,
        rt.note,
        rt.frequency,
        rt.start_date,
        rt.end_date,
        rt.next_execution_date,
        rt.never_ends,
        rt.is_active,
        rt.created_at,
        rt.updated_at
      FROM recurring_transactions rt
      LEFT JOIN categories c ON c.id = rt.category_id
      WHERE rt.user_id = ?
      ORDER BY rt.created_at DESC`,
      [userId]
    );

    res.json({
      success: true,
      recurring_transactions: recurring,
    });
  } catch (err) {
    res.status(500).json({
      success: false,
      message: err.message,
    });
  }
};

const updateRecurringTransaction = async (req, res) => {
  try {
    if (req.user.email === DEMO_EMAIL) {
      return res.status(403).json({
        success: false,
        message: 'Demo mode is read-only. Create your own account to manage personal finances.'
      });
    }

    const userId = req.user.id;
    const { id } = req.params;
    const { amount, category_id, note, frequency, start_date, end_date, never_ends, is_active } = req.body;

    // Validate category exists if provided
    if (category_id) {
      const [categories] = await pool.query(
        'SELECT id FROM categories WHERE id = ? AND user_id = ?',
        [category_id, userId]
      );
      if (categories.length === 0) {
        return res.status(400).json({
          success: false,
          message: 'Invalid category',
        });
      }
    }

    // Fetch the current row so fields the client omitted keep their stored
    // values (the UPDATE below writes every column; writing NULLs would break
    // the schedule).
    const [current] = await pool.query(
      'SELECT frequency, start_date, is_active FROM recurring_transactions WHERE id = ? AND user_id = ?',
      [id, userId]
    );
    if (current.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'Recurring transaction not found',
      });
    }

    // Preserve is_active when the client doesn't send it (e.g. the edit modal).
    // Writing NULL here makes the cron's `WHERE is_active = TRUE` filter exclude
    // the row forever, so edited recurrings silently stop processing. Coalesce
    // any legacy NULL (from the old bug) to TRUE so re-editing repairs the row.
    const storedIsActive = current[0].is_active === null ? 1 : current[0].is_active;
    const effectiveIsActive = is_active === undefined ? storedIsActive : (is_active ? 1 : 0);

    // Recalculate next execution date from the schedule itself:
    //   - start_date in the future → the first occurrence IS start_date
    //   - start_date today or past → the first occurrence is the (possibly
    //     new) start_date too; any occurrence that already has a transaction
    //     is skipped forward until the next unexecuted one
    // Today is used ONLY to decide whether the next occurrence is due —
    // never as the recurrence anchor. Re-anchoring a past start date onto
    // today's date would silently change the cadence (monthly on the 1st
    // would become monthly on whichever day the edit happened).
    const newStartDate = start_date || current[0].start_date;
    // Normalize dates to IST 'YYYY-MM-DD' strings before storing: the validator
    // hands us JS Date objects, and mysql2 serializes those in server-local
    // time, which can shift the stored date by a day on non-IST servers.
    const startDateStr = typeof newStartDate === 'string'
      ? newStartDate.split('T')[0]
      : toIstDateString(newStartDate);
    const endDateStr = end_date ? toIstDateString(end_date) : end_date;

    // Anchor on the schedule's own start date, then skip any occurrence that
    // already has a transaction so editing a schedule that already ran cannot
    // make the scheduler duplicate it (e.g. start Oct 1, today Oct 5, Oct 1
    // already executed → next_execution_date becomes Nov 1, never Oct 5).
    const effectiveFrequency = FREQUENCIES.includes(frequency)
      ? frequency
      : FREQUENCIES.includes(current[0].frequency)
        ? current[0].frequency
        : 'monthly';
    const nextExecutionDate = await advancePastExecutedOccurrences(
      userId, id, startDateStr, effectiveFrequency
    );

    const [result] = await pool.query(
      `UPDATE recurring_transactions 
       SET amount = ?, category_id = ?, note = ?, frequency = ?, start_date = ?, end_date = ?, never_ends = ?, is_active = ?, next_execution_date = ?, updated_at = CURRENT_TIMESTAMP
       WHERE id = ? AND user_id = ?`,
      [amount, category_id, note, frequency, startDateStr, endDateStr, never_ends, effectiveIsActive, nextExecutionDate, id, userId]
    );

    if (result.affectedRows === 0) {
      return res.status(404).json({
        success: false,
        message: 'Recurring transaction not found',
      });
    }

    res.json({
      success: true,
      message: 'Recurring transaction updated',
    });
  } catch (err) {
    res.status(500).json({
      success: false,
      message: err.message,
    });
  }
};

const deleteRecurringTransaction = async (req, res) => {
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
      'DELETE FROM recurring_transactions WHERE id = ? AND user_id = ?',
      [id, userId]
    );

    if (result.affectedRows === 0) {
      return res.status(404).json({
        success: false,
        message: 'Recurring transaction not found',
      });
    }

    res.json({
      success: true,
      message: 'Recurring transaction deleted',
    });
  } catch (err) {
    res.status(500).json({
      success: false,
      message: err.message,
    });
  }
};

const pauseRecurringTransaction = async (req, res) => {
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
      'UPDATE recurring_transactions SET is_active = FALSE WHERE id = ? AND user_id = ?',
      [id, userId]
    );

    if (result.affectedRows === 0) {
      return res.status(404).json({
        success: false,
        message: 'Recurring transaction not found',
      });
    }

    res.json({
      success: true,
      message: 'Recurring transaction paused',
    });
  } catch (err) {
    res.status(500).json({
      success: false,
      message: err.message,
    });
  }
};

const resumeRecurringTransaction = async (req, res) => {
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
      'UPDATE recurring_transactions SET is_active = TRUE WHERE id = ? AND user_id = ?',
      [id, userId]
    );

    if (result.affectedRows === 0) {
      return res.status(404).json({
        success: false,
        message: 'Recurring transaction not found',
      });
    }

    res.json({
      success: true,
      message: 'Recurring transaction resumed',
    });
  } catch (err) {
    res.status(500).json({
      success: false,
      message: err.message,
    });
  }
};

module.exports = {
  createRecurringTransaction,
  getRecurringTransactions,
  updateRecurringTransaction,
  deleteRecurringTransaction,
  pauseRecurringTransaction,
  resumeRecurringTransaction,
};
