-- Migration: Create budget_carryforward_state table
-- Tracks for which (user, month) pairs the automatic budget carry-forward has
-- already run, so it never re-seeds a month after the user deleted its budgets.
--
-- Why: carry-forward copies the most recent earlier month's budgets into the
-- CURRENT month only when rows are missing. Without a claim marker, a user who
-- deletes a carried-forward budget would see it resurrect on the next fetch.
-- The first carry-forward attempt for a month claims it here; later attempts
-- (including after budget deletions) are no-ops.
--
-- Idempotent: PRIMARY KEY (user_id, month); carry-forward uses INSERT IGNORE.

CREATE TABLE IF NOT EXISTS budget_carryforward_state (
    user_id BIGINT UNSIGNED NOT NULL,
    month DATE NOT NULL,
    handled_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (user_id, month),
    CONSTRAINT fk_bcfs_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
) ENGINE=InnoDB;
