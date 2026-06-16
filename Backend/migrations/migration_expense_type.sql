ALTER TABLE expenses
  ADD COLUMN transaction_type ENUM('expense', 'income') NOT NULL DEFAULT 'expense' AFTER amount;
