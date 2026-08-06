-- Migration: Add transaction_type column to expenses table
-- Date: 2026-08-06
-- Purpose: Store explicit transaction type (income/expense) instead of inferring from category names

-- Step 1: Add the column with a default so existing rows get a value immediately
ALTER TABLE expenses
ADD COLUMN transaction_type ENUM('income', 'expense') NOT NULL DEFAULT 'expense';

-- Step 2: Backfill existing rows based on category names (the previous heuristic)
-- This maps legacy data so existing "Salary" / "Freelance" transactions are marked as income
UPDATE expenses e
JOIN categories c ON c.id = e.category_id
SET e.transaction_type = 'income'
WHERE c.name IN ('Salary', 'Freelance')
  AND e.transaction_type = 'expense';

-- Step 3: Add an index for fast filtering by transaction type + user + date
CREATE INDEX idx_expenses_user_type_date ON expenses(user_id, transaction_type, expense_date DESC);
