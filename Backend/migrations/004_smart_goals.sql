-- Migration: Support Smart Financial Goals
-- Add goal_id to expenses and update goals table structure if needed

-- Add goal_id column to expenses table
ALTER TABLE expenses ADD COLUMN goal_id BIGINT UNSIGNED NULL;

-- Add foreign key constraint to expenses table
ALTER TABLE expenses 
  ADD CONSTRAINT fk_expenses_goal 
  FOREIGN KEY (goal_id) 
  REFERENCES goals(id) 
  ON DELETE SET NULL 
  ON UPDATE CASCADE;

-- Create index on goal_id to speed up sum queries
CREATE INDEX idx_expenses_goal_id ON expenses(goal_id);
