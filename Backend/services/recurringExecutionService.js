const pool = require('../config/db');

/**
 * Recurring Transaction Execution Service
 * Handles the execution of due recurring transactions with idempotency guarantees
 */

/**
 * Calculate the next execution date for a recurring transaction
 * Handles edge cases like 31st of month, February, leap years
 */
function calculateNextExecutionDate(currentDate, frequency) {
  const current = new Date(currentDate);
  const next = new Date(current);

  switch (frequency) {
    case 'daily':
      next.setDate(next.getDate() + 1);
      break;
    case 'weekly':
      next.setDate(next.getDate() + 7);
      break;
    case 'monthly':
      // Handle month-end dates (e.g., 31st -> last day of next month)
      const currentDay = current.getDate();
      const lastDayOfCurrentMonth = new Date(current.getFullYear(), current.getMonth() + 1, 0).getDate();
      
      if (currentDay === lastDayOfCurrentMonth) {
        // If current date is last day of month, set to last day of next month
        next.setMonth(next.getMonth() + 1);
        next.setDate(0); // Set to last day of the new month
      } else {
        next.setMonth(next.getMonth() + 1);
        // If the day doesn't exist in the target month (e.g., Feb 31), use last day of that month
        const lastDayOfNextMonth = new Date(next.getFullYear(), next.getMonth() + 1, 0).getDate();
        if (currentDay > lastDayOfNextMonth) {
          next.setDate(lastDayOfNextMonth);
        } else {
          next.setDate(currentDay);
        }
      }
      break;
    case 'yearly':
      next.setFullYear(next.getFullYear() + 1);
      // Handle Feb 29 for non-leap years
      if (current.getMonth() === 1 && current.getDate() === 29) {
        const isLeapYear = (next.getFullYear() % 4 === 0 && next.getFullYear() % 100 !== 0) || next.getFullYear() % 400 === 0;
        if (!isLeapYear) {
          next.setDate(28);
        }
      }
      break;
    default:
      return currentDate;
  }

  return next.toISOString().split('T')[0];
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
 * Create a transaction from a recurring schedule
 */
async function createTransactionFromRecurring(recurring) {
  const connection = await pool.getConnection();
  
  try {
    await connection.beginTransaction();

    // Insert the transaction
    const [result] = await connection.query(
      `INSERT INTO expenses 
       (user_id, category_id, amount, expense_date, note, is_recurring, recurring_transaction_id) 
       VALUES (?, ?, ?, ?, ?, TRUE, ?)`,
      [
        recurring.user_id,
        recurring.category_id,
        recurring.amount,
        recurring.next_execution_date,
        recurring.note,
        recurring.id
      ]
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
  const action = type === 'income' ? 'credited' : 'added';
  const title = type === 'income' ? 'Recurring income credited' : 'Recurring expense added';
  const description = `${categoryName || 'Transaction'} of ₹${amount.toLocaleString('en-IN')} was automatically ${action}.`;
  
  await pool.query(
    `INSERT INTO notifications (user_id, title, description, type, read_status) 
     VALUES (?, ?, ?, 'recurring', FALSE)`,
    [userId, title, description]
  );
}

/**
 * Process a single recurring transaction
 * Returns execution result
 */
async function processRecurringTransaction(recurring) {
  const today = new Date().toISOString().split('T')[0];
  const nextExecutionDate = recurring.next_execution_date;

  // Check if due (next_execution_date <= today)
  if (nextExecutionDate > today) {
    return { status: 'skipped', reason: 'not_due' };
  }

  // Check if already active
  if (!recurring.is_active) {
    return { status: 'skipped', reason: 'inactive' };
  }

  // Check if end date has passed
  if (recurring.end_date && nextExecutionDate > recurring.end_date) {
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
    const newNextDate = calculateNextExecutionDate(nextExecutionDate, recurring.frequency);
    await pool.query(
      'UPDATE recurring_transactions SET next_execution_date = ? WHERE id = ?',
      [newNextDate, recurring.id]
    );
    return { status: 'skipped', reason: 'already_executed' };
  }

  // Create the transaction
  try {
    const transactionId = await createTransactionFromRecurring(recurring);

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
    const newNextDate = calculateNextExecutionDate(nextExecutionDate, recurring.frequency);
    
    // Check if next execution is beyond end date
    if (recurring.end_date && newNextDate > recurring.end_date) {
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
  const today = new Date().toISOString().split('T')[0];
  
  // Get all active recurring transactions that are due
  const [dueTransactions] = await pool.query(
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

  const results = {
    processed: dueTransactions.length,
    succeeded: 0,
    failed: 0,
    skipped: 0,
    completed: 0,
    details: []
  };

  for (const recurring of dueTransactions) {
    const result = await processRecurringTransaction(recurring);
    
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
  calculateNextExecutionDate,
  processRecurringTransaction,
  processDueRecurringTransactions,
  getRecurringSummary,
  getRecurringExecutionHistory
};
