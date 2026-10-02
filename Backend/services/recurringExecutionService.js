const pool = require('../config/db');

/**
 * Recurring Transaction Execution Service
 * Handles the execution of due recurring transactions with idempotency guarantees
 */

// ── IST date helper ─────────────────────────────────────────────────────────
// All recurring date comparisons use Asia/Kolkata calendar date.
// `toISOString()` returns UTC, which is 5.5 hours behind IST — using it
// causes a 5.5-hour execution delay and incorrect "Today" display.

/**
 * Return the current calendar date in Asia/Kolkata as YYYY-MM-DD.
 * Used for all recurring-transaction date comparisons.
 */
function getIstDate() {
  return new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Kolkata' });
}

/**
 * Validate that a value is a real YYYY-MM-DD calendar date before it is bound
 * to a DATE/DATETIME placeholder. mysql2 (no dateStrings flag) returns DATE
 * columns as JS Date objects and the express validator can hand us Date
 * objects too, so both shapes are accepted — anything else (undefined, null,
 * a "?" string, a mangled value) throws at the exact query that would have
 * received it, instead of reaching MySQL as garbage.
 * Returns the normalized YYYY-MM-DD string.
 */
function requireIstDateString(value, label) {
  if (value === undefined || value === null) {
    throw new Error(
      `[RecurringExecution] ${label} is ${value === undefined ? 'undefined' : 'null'}, expected a YYYY-MM-DD date`
    );
  }
  const s = value instanceof Date
    ? toIstDateString(value)
    : String(value).split('T')[0].trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) {
    throw new Error(
      `[RecurringExecution] ${label} is not a valid YYYY-MM-DD date, got ${JSON.stringify(String(value))}`
    );
  }
  // Calendar validity: MySQL strict mode rejects impossible dates like
  // '2026-08-35' with "Incorrect date value" (1292), so catch them here with
  // a precise message instead of at the database.
  const [yy, mm, dd] = s.split('-').map(Number);
  const daysInMonth = new Date(yy, mm, 0).getDate();
  if (mm < 1 || mm > 12 || dd < 1 || dd > daysInMonth) {
    throw new Error(
      `[RecurringExecution] ${label} is not a real calendar date, got ${JSON.stringify(s)}`
    );
  }
  return s;
}

/**
 * Parse a YYYY-MM-DD date string into a plain Date at IST midnight.
 * Avoids UTC-shift pitfalls when the string is fed into `new Date()`.
 */
function parseDateAsIst(dateStr) {
  const [y, m, d] = String(dateStr).split('T')[0].split('-').map(Number);
  return new Date(y, m - 1, d);
}

/**
 * Format a Date (or date string) as YYYY-MM-DD in IST.
 */
function toIstDateString(dateOrStr) {
  const d = typeof dateOrStr === 'string' ? parseDateAsIst(dateOrStr) : dateOrStr;
  return d.toLocaleDateString('en-CA', { timeZone: 'Asia/Kolkata' });
}

/**
 * Calculate the next execution date for a recurring transaction.
 * Handles month-end edge cases (Jan 31 → Feb 28/29, etc.).
 * All arithmetic is done in IST calendar days.
 */
function calculateNextExecutionDate(currentDate, frequency) {
  // Parse the date in IST to avoid UTC shift
  const current = typeof currentDate === 'string' ? parseDateAsIst(currentDate) : new Date(currentDate);
  const year = current.getFullYear();
  const month = current.getMonth(); // 0-indexed
  const day = current.getDate();

  let nextYear = year;
  let nextMonth = month;
  let nextDay = day;

  switch (frequency) {
    case 'daily':
      nextDay = day + 1;
      break;
    case 'weekly':
      nextDay = day + 7;
      break;
    case 'monthly': {
      // Advance month, clamp to last day of target month.
      // Jan 31 → Feb 28/29, Feb 28 → Mar 28, Mar 31 → Apr 30, etc.
      nextMonth = month + 1;
      if (nextMonth > 11) { nextMonth = 0; nextYear++; }
      const lastDayOfTarget = new Date(nextYear, nextMonth + 1, 0).getDate();
      nextDay = Math.min(day, lastDayOfTarget);
      break;
    }
    case 'yearly': {
      nextYear = year + 1;
      // Handle Feb 29 → Feb 28 in non-leap year
      if (month === 1 && day === 29) {
        const isLeap = (nextYear % 4 === 0 && nextYear % 100 !== 0) || nextYear % 400 === 0;
        nextDay = isLeap ? 29 : 28;
      }
      break;
    }
    default:
      return typeof currentDate === 'string' ? currentDate.split('T')[0] : toIstDateString(current);
  }

  // Build YYYY-MM-DD without any timezone conversion.
  // Normalizing through a Date rolls daily/weekly overflow into the next
  // month/year (Aug 28 + 7 -> Sep 4, Dec 30 + 7 -> Jan 6) instead of
  // producing calendar-invalid strings like '2026-08-35' that MySQL strict
  // mode rejects with "Incorrect date value" (1292) — which previously
  // stalled the recurring forever and 500'd the whole process-due endpoint.
  // For monthly/yearly (day already clamped to a real date) this is identity.
  const normalized = new Date(nextYear, nextMonth, nextDay);
  const finalYear = normalized.getFullYear();
  const finalMonth = normalized.getMonth(); // 0-indexed
  const finalDay = normalized.getDate();
  return `${finalYear}-${String(finalMonth + 1).padStart(2, '0')}-${String(finalDay).padStart(2, '0')}`;
}

/**
 * Check if a transaction has already been executed for a specific date
 * This prevents duplicate execution
 */
async function hasTransactionBeenExecuted(userId, recurringTransactionId, executionDate) {
  const [existing] = await pool.query(
    `SELECT id FROM expenses 
     WHERE user_id = ? 
     AND recurring_transaction_id = ? 
     AND expense_date = ?`,
    [userId, recurringTransactionId, executionDate]
  );
  return existing.length > 0;
}

/**
 * Which optional expense columns actually exist on this server.
 *
 * `title` and `goal_id` are NOT part of the recurring startup migrations, so
 * production (an older schema) may not have them while a fresh schema does.
 * Probing once and caching keeps recurring execution working on both instead
 * of failing the INSERT with "Unknown column".
 */
let optionalExpenseColumns = null;
async function getOptionalExpenseColumns() {
  if (optionalExpenseColumns) return optionalExpenseColumns;
  try {
    const [rows] = await pool.query('SHOW COLUMNS FROM expenses');
    const present = new Set(rows.map((r) => r.Field));
    optionalExpenseColumns = { title: present.has('title'), goal_id: present.has('goal_id') };
  } catch (err) {
    // Never let schema introspection break execution: assume the modern shape
    // and let the INSERT itself surface any real problem.
    console.error(
      '[RecurringExecution] could not inspect the expenses schema; assuming title/goal_id exist:',
      err && err.message ? err.message : err
    );
    optionalExpenseColumns = { title: true, goal_id: true };
  }
  return optionalExpenseColumns;
}

/**
 * Create a transaction from a recurring schedule
 *
 * `extras` carries fields that only exist on the very first occurrence (the
 * transaction the user typed when creating the schedule): an explicit title and
 * an optional goal link. The scheduler never passes them, so every later
 * occurrence is created exactly as before.
 */
async function createTransactionFromRecurring(recurring, extras = {}) {
  const connection = await pool.getConnection();
  const executionDate = requireIstDateString(
    recurring.next_execution_date,
    `next_execution_date of recurring #${recurring.id}`
  );

  try {
    await connection.beginTransaction();

    const columns = await getOptionalExpenseColumns();
    const extraColumns = [];
    const extraValues = [];
    if (columns.title) {
      extraColumns.push('title');
      extraValues.push(extras.title ? String(extras.title).slice(0, 500) : null);
    }
    if (columns.goal_id) {
      extraColumns.push('goal_id');
      extraValues.push(extras.goal_id != null ? extras.goal_id : null);
    }

    const insertColumns = [
      'user_id', 'category_id', 'amount', 'expense_date', 'note',
      ...extraColumns, 'is_recurring', 'recurring_transaction_id', 'transaction_type',
    ];
    const insertValues = [
      recurring.user_id,
      recurring.category_id,
      recurring.amount,
      executionDate,
      recurring.note,
      ...extraValues,
      true,
      recurring.id,
      recurring.type,
    ];

    // Insert the transaction
    const [result] = await connection.query(
      `INSERT INTO expenses (${insertColumns.join(', ')}) 
       VALUES (${insertValues.map(() => '?').join(', ')})`,
      insertValues
    );

    await connection.commit();
    return result.insertId;
  } catch (error) {
    await connection.rollback();
    throw error;
  } finally {
    connection.release();
  }
}

/**
 * Create a notification for recurring transaction execution
 */
async function createRecurringNotification(userId, type, amount, categoryName) {
  // Best-effort: the expense is already committed when this runs, so a
  // notification failure (e.g. schema drift on the notifications table) must
  // never bubble up and mark the execution itself as failed.
  try {
    const action = type === 'income' ? 'credited' : 'added';
    const title = type === 'income' ? 'Recurring income credited' : 'Recurring expense added';
    const description = `${categoryName || 'Transaction'} of ₹${Number(amount).toLocaleString('en-IN')} was automatically ${action}.`;
    
    await pool.query(
      `INSERT INTO notifications (user_id, title, description, type, read_status) 
       VALUES (?, ?, ?, 'recurring', FALSE)`,
      [userId, title, description]
    );
  } catch (err) {
    console.error(
      `[RecurringExecution] notification insert failed for user ${userId} (transaction execution unaffected):`,
      err && err.message ? err.message : err
    );
  }
}

/**
 * Process a single recurring transaction
 * Returns execution result
 *
 * This is the single execution engine for BOTH the scheduler and the
 * first-occurrence path in createRecurringSchedule(), so "due" detection,
 * duplicate protection, end-date handling and the next-date advancement can
 * never drift apart between the two entry points.
 */
async function processRecurringTransaction(recurring, extras = {}) {
  const today = getIstDate();
  const nextExecutionDate = requireIstDateString(
    recurring.next_execution_date,
    `next_execution_date of recurring #${recurring.id}`
  );
  const endDate = recurring.end_date == null
    ? null
    : requireIstDateString(recurring.end_date, `end_date of recurring #${recurring.id}`);

  // Check if due (next_execution_date <= today)
  if (nextExecutionDate > today) {
    return { status: 'skipped', reason: 'not_due' };
  }

  // Check if already active
  if (!recurring.is_active) {
    return { status: 'skipped', reason: 'inactive' };
  }

  // Check if end date has passed
  if (endDate && nextExecutionDate > endDate) {
    // Mark as inactive
    await pool.query(
      'UPDATE recurring_transactions SET is_active = FALSE WHERE id = ?',
      [recurring.id]
    );
    return { status: 'completed', reason: 'end_date_passed' };
  }

  // Check for duplicate execution (idempotency)
  const alreadyExecuted = await hasTransactionBeenExecuted(
    recurring.user_id,
    recurring.id,
    nextExecutionDate
  );
  if (alreadyExecuted) {
    // Already executed, just update next execution date
    const newNextDate = requireIstDateString(
      calculateNextExecutionDate(nextExecutionDate, recurring.frequency),
      `calculated next_execution_date of recurring #${recurring.id}`
    );
    await pool.query(
      'UPDATE recurring_transactions SET next_execution_date = ? WHERE id = ?',
      [newNextDate, recurring.id]
    );
    return { status: 'skipped', reason: 'already_executed' };
  }

  // Create the transaction
  try {
    const transactionId = await createTransactionFromRecurring(recurring, extras);

    // Get category name for notification
    const [category] = await pool.query(
      'SELECT name FROM categories WHERE id = ?',
      [recurring.category_id]
    );
    const categoryName = category[0]?.name || 'Transaction';

    // Create notification
    await createRecurringNotification(
      recurring.user_id,
      recurring.type,
      recurring.amount,
      categoryName
    );

    // Calculate and update next execution date
    const newNextDate = requireIstDateString(
      calculateNextExecutionDate(nextExecutionDate, recurring.frequency),
      `calculated next_execution_date of recurring #${recurring.id}`
    );

    // Check if next execution is beyond end date
    if (endDate && newNextDate > endDate) {
      await pool.query(
        'UPDATE recurring_transactions SET next_execution_date = ?, is_active = FALSE WHERE id = ?',
        [newNextDate, recurring.id]
      );
    } else {
      await pool.query(
        'UPDATE recurring_transactions SET next_execution_date = ? WHERE id = ?',
        [newNextDate, recurring.id]
      );
    }

    return {
      status: 'succeeded',
      transactionId,
      executionDate: nextExecutionDate,
      nextExecutionDate: newNextDate
    };
  } catch (error) {
    console.error(`Error processing recurring transaction ${recurring.id}:`, error);
    return { status: 'failed', reason: error.message };
  }
}

/**
 * Process all due recurring transactions
 * Called by the scheduler endpoint
 */
async function processDueRecurringTransactions() {
  const today = requireIstDateString(getIstDate(), 'IST today');
  
  // Get all active recurring transactions that are due.
  // This SELECT sits OUTSIDE the per-item try/catch, so a failure here is the
  // one that surfaces (via the route's catch) as a bare err.message in the
  // 500 response. Enrich it with errno/sqlState and the bound value so a
  // production failure pinpoints the offending query instead of a cryptic
  // "Incorrect datetime value" line. Re-throw: never swallowed, never masked.
  let dueTransactions;
  try {
    [dueTransactions] = await pool.query(
      `SELECT 
        rt.id,
        rt.user_id,
        rt.type,
        rt.amount,
        rt.category_id,
        rt.note,
        rt.frequency,
        rt.start_date,
        rt.end_date,
        rt.next_execution_date,
        rt.never_ends,
        rt.is_active
       FROM recurring_transactions rt
       WHERE rt.is_active = TRUE
       AND rt.next_execution_date <= ?
       ORDER BY rt.next_execution_date ASC`,
      [today]
    );
  } catch (err) {
    throw new Error(
      `process-due due-SELECT failed: ${err.message}` +
      ` | code=${err.code ?? 'n/a'} errno=${err.errno ?? 'n/a'} sqlState=${err.sqlState ?? 'n/a'}` +
      ` | bound next_execution_date <= ${JSON.stringify(today)}`,
      { cause: err }
    );
  }

  const results = {
    processed: dueTransactions.length,
    succeeded: 0,
    failed: 0,
    skipped: 0,
    completed: 0,
    details: []
  };

  for (const recurring of dueTransactions) {
    // Fault isolation: one malformed row (e.g. a poisoned next_execution_date)
    // must not 500 the whole endpoint and block every other user's recurring
    // transactions. The failure is recorded per-item; processing continues.
    let result;
    try {
      result = await processRecurringTransaction(recurring);
    } catch (err) {
      console.error(`Error processing recurring transaction ${recurring.id}:`, err);
      result = { status: 'failed', reason: err.message };
    }
    
    results.details.push({
      recurringId: recurring.id,
      userId: recurring.user_id,
      type: recurring.type,
      amount: recurring.amount,
      ...result
    });

    switch (result.status) {
      case 'succeeded':
        results.succeeded++;
        break;
      case 'failed':
        results.failed++;
        break;
      case 'completed':
        results.completed++;
        break;
      default:
        results.skipped++;
    }
  }

  return results;
}

/**
 * Load a freshly created schedule row in the exact shape the execution engine
 * expects, so first-occurrence processing uses the same code path as the
 * scheduler (same due check, same duplicate guard, same advancement).
 */
async function fetchRecurringForExecution(recurringId) {
  const [rows] = await pool.query(
    `SELECT id, user_id, type, amount, category_id, note, frequency,
            start_date, end_date, next_execution_date, never_ends, is_active
       FROM recurring_transactions
      WHERE id = ?
      LIMIT 1`,
    [recurringId]
  );
  return rows[0] || null;
}

/**
 * Create a recurring schedule AND its first occurrence in one place.
 *
 * Root cause this fixes: the schedule used to be stored with
 * next_execution_date = start_date + 1 period, so the occurrence ON start_date
 * was never selected by the scheduler
 * (`WHERE next_execution_date <= today`) and was silently dropped. The
 * frontend papered over this by inserting the first transaction itself, which
 * left two sources of truth and produced either a missing or a duplicated
 * first transaction depending on the path taken.
 *
 * Now the backend owns the whole lifecycle:
 *   1. the rule is stored with next_execution_date = its first occurrence,
 *   2. if that occurrence is due now, it is executed immediately through the
 *      very same processRecurringTransaction() the scheduler uses, which also
 *      advances next_execution_date to the following occurrence,
 *   3. if it is in the future, nothing is created and the stored date is left
 *      for the scheduler to pick up on the day it comes due.
 *
 * `skipFirstOccurrence` is used when the caller already materialised the first
 * transaction itself (converting an existing transaction into a recurring
 * one); the rule is then anchored one period past that transaction.
 */
async function createRecurringSchedule(input) {
  const {
    userId, type, amount, category_id, note, title, goal_id,
    frequency, start_date, end_date, never_ends,
    first_transaction_date, skipFirstOccurrence = false,
  } = input;

  const startDateStr = requireIstDateString(start_date, 'start_date');
  const endDateStr = end_date == null ? null : requireIstDateString(end_date, 'end_date');

  // The first occurrence is the transaction the user typed, when they gave one
  // (AddTransactionModal keeps its own Date field separate from Start Date).
  // Without it the start date itself is the first occurrence.
  const firstOccurrence = first_transaction_date == null
    ? startDateStr
    : requireIstDateString(first_transaction_date, 'first_transaction_date');

  // A rule whose first transaction already exists must not schedule that same
  // occurrence again, or the scheduler would recreate it.
  const initialNextExecution = skipFirstOccurrence
    ? requireIstDateString(calculateNextExecutionDate(firstOccurrence, frequency), 'calculated next_execution_date')
    : firstOccurrence;

  const [result] = await pool.query(
    `INSERT INTO recurring_transactions
     (user_id, type, amount, category_id, note, frequency, start_date, end_date, next_execution_date, never_ends)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [userId, type, amount, category_id, note, frequency, startDateStr, endDateStr, initialNextExecution, never_ends]
  );

  const recurringId = result.insertId;

  if (skipFirstOccurrence) {
    return {
      id: recurringId,
      firstTransaction: { status: 'skipped', reason: 'first_transaction_already_exists' },
    };
  }

  const recurring = await fetchRecurringForExecution(recurringId);
  if (!recurring) {
    return { id: recurringId, firstTransaction: { status: 'skipped', reason: 'rule_not_found' } };
  }

  // Not due yet: leave next_execution_date exactly as stored and let the
  // scheduler create the transaction on the day it comes due (never early).
  if (requireIstDateString(recurring.next_execution_date, 'next_execution_date') > getIstDate()) {
    return {
      id: recurringId,
      firstTransaction: { status: 'skipped', reason: 'not_due' },
      nextExecutionDate: recurring.next_execution_date,
    };
  }

  // Due now: run the shared execution engine. A failure here must not discard
  // the rule that was just created — the scheduler retries it on its next run.
  try {
    const execution = await processRecurringTransaction(recurring, { title, goal_id });
    return { id: recurringId, firstTransaction: execution };
  } catch (err) {
    console.error(
      `First occurrence of recurring ${recurringId} could not be created; the scheduler will retry:`,
      err && err.message ? err.message : err
    );
    return {
      id: recurringId,
      firstTransaction: { status: 'failed', reason: err.message },
    };
  }
}

/**
 * Find the first occurrence at or after `candidateDate` that has not been
 * executed yet.
 *
 * The edit path re-anchors a schedule so it becomes due immediately. Without
 * this guard, editing a schedule that already ran its first occurrence would
 * point next_execution_date back at an executed date and the scheduler would
 * duplicate that transaction. Walking forward past executed occurrences keeps
 * "due immediately" for untouched schedules and makes edits idempotent.
 */
async function advancePastExecutedOccurrences(userId, recurringId, candidateDate, frequency, maxSteps = 400) {
  let date = requireIstDateString(candidateDate, 'candidate next_execution_date');
  for (let step = 0; step < maxSteps; step++) {
    const executed = await hasTransactionBeenExecuted(userId, recurringId, date);
    if (!executed) return date;
    date = requireIstDateString(
      calculateNextExecutionDate(date, frequency),
      'calculated next_execution_date'
    );
  }
  return date;
}

/**
 * Get recurring summary for AI/analytics consumption
 */
async function getRecurringSummary(userId) {
  const [recurring] = await pool.query(
    `SELECT 
      rt.type,
      rt.amount,
      rt.frequency,
      rt.is_active
     FROM recurring_transactions rt
     WHERE rt.user_id = ? AND rt.is_active = TRUE`,
    [userId]
  );

  let monthlyExpenses = 0;
  let monthlyIncome = 0;
  let activeCount = 0;

  for (const item of recurring) {
    activeCount++;
    let monthlyAmount = item.amount;

    // Normalize to monthly equivalent
    switch (item.frequency) {
      case 'daily':
        monthlyAmount = item.amount * 30;
        break;
      case 'weekly':
        monthlyAmount = item.amount * 4.33;
        break;
      case 'yearly':
        monthlyAmount = item.amount / 12;
        break;
      case 'monthly':
      default:
        monthlyAmount = item.amount;
    }

    if (item.type === 'expense') {
      monthlyExpenses += monthlyAmount;
    } else {
      monthlyIncome += monthlyAmount;
    }
  }

  const netCashFlow = monthlyIncome - monthlyExpenses;

  return {
    activeCount,
    monthlyExpenses: Math.round(monthlyExpenses),
    monthlyIncome: Math.round(monthlyIncome),
    netCashFlow: Math.round(netCashFlow),
    items: recurring
  };
}

/**
 * Get execution history for a recurring transaction
 */
async function getRecurringExecutionHistory(recurringTransactionId, userId) {
  const [transactions] = await pool.query(
    `SELECT 
      e.id,
      e.amount,
      e.expense_date,
      e.note,
      c.name AS category_name
     FROM expenses e
     LEFT JOIN categories c ON c.id = e.category_id
     WHERE e.recurring_transaction_id = ?
     AND e.user_id = ?
     ORDER BY e.expense_date DESC`,
    [recurringTransactionId, userId]
  );

  return transactions;
}

module.exports = {
  getIstDate,
  parseDateAsIst,
  toIstDateString,
  requireIstDateString,
  calculateNextExecutionDate,
  createRecurringSchedule,
  advancePastExecutedOccurrences,
  processRecurringTransaction,
  processDueRecurringTransactions,
  getRecurringSummary,
  getRecurringExecutionHistory
};
