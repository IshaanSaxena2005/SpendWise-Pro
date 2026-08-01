-- Migration: Add Recurring Transactions Support (TiDB-compatible)
-- Description: Adds recurring_transactions table and updates expenses table to support recurring transactions
-- Date: 2026-08-01
-- IMPORTANT: Run this migration only once on production database

-- Step 1: Create recurring_transactions table
CREATE TABLE recurring_transactions (
    id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    user_id BIGINT UNSIGNED NOT NULL,
    linked_transaction_id BIGINT UNSIGNED NULL,
    type ENUM('income', 'expense') NOT NULL,
    amount DECIMAL(12, 2) NOT NULL,
    category_id BIGINT UNSIGNED NULL,
    note VARCHAR(500) NULL,
    frequency ENUM('daily', 'weekly', 'monthly', 'yearly') NOT NULL,
    start_date DATE NOT NULL,
    end_date DATE NULL,
    next_execution_date DATE NOT NULL,
    never_ends BOOLEAN DEFAULT FALSE,
    is_active BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    CONSTRAINT chk_recurring_amount_positive CHECK (amount > 0),
    CONSTRAINT chk_recurring_dates CHECK (end_date IS NULL OR end_date >= start_date),
    CONSTRAINT fk_recurring_user 
        FOREIGN KEY (user_id) REFERENCES users (id) 
        ON DELETE CASCADE,
    CONSTRAINT fk_recurring_category
        FOREIGN KEY (category_id) REFERENCES categories (id)
        ON DELETE SET NULL
        ON UPDATE CASCADE,
    CONSTRAINT fk_recurring_transaction
        FOREIGN KEY (linked_transaction_id) REFERENCES expenses (id)
        ON DELETE SET NULL
        ON UPDATE CASCADE
) ENGINE=InnoDB;

-- Step 2: Add is_recurring column to expenses
ALTER TABLE expenses ADD COLUMN is_recurring BOOLEAN DEFAULT FALSE;

-- Step 3: Add recurring_transaction_id column to expenses
ALTER TABLE expenses ADD COLUMN recurring_transaction_id BIGINT UNSIGNED NULL;

-- Step 4: Add foreign key constraint
ALTER TABLE expenses ADD CONSTRAINT fk_expenses_recurring FOREIGN KEY (recurring_transaction_id) REFERENCES recurring_transactions (id) ON DELETE SET NULL ON UPDATE CASCADE;

-- Step 5: Create indexes
CREATE INDEX idx_recurring_user_active ON recurring_transactions(user_id, is_active);
CREATE INDEX idx_recurring_next_execution ON recurring_transactions(next_execution_date, is_active);
CREATE INDEX idx_recurring_user_execution ON recurring_transactions(user_id, next_execution_date, is_active);
CREATE INDEX idx_expenses_recurring ON expenses(recurring_transaction_id, user_id);
