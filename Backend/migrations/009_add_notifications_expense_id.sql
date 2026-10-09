-- Migration: Link anomaly notifications to their source expense
-- Date: 2026-10-07
-- Purpose: Fix stale anomaly alerts. notifications previously had no reference
--          to the expense that produced them, so deleting an expense left the
--          alert on the Dashboard forever.
--
-- What this does:
--   1. Adds notifications.expense_id (NULL for every non-anomaly notification
--      type and for pre-migration legacy rows — nothing is backfilled).
--   2. Adds fk_notifications_expense with ON DELETE CASCADE so deleting an
--      expense automatically removes its anomaly alert. Other notification
--      types (budget, goal, recurring, ...) keep expense_id NULL and are
--      unaffected.
--   3. Adds (user_id, type, created_at) index used by the dashboard query.
--
-- Idempotency: run only on databases that do not yet have the column/FK
-- (the migration runner and startupMigrations both skip ER_DUP_FIELDNAME /
-- ER_DUP_KEYNAME / ER_FK_DUP_NAME). Does not delete or modify any row.

ALTER TABLE notifications
ADD COLUMN expense_id BIGINT UNSIGNED NULL;

ALTER TABLE notifications
ADD CONSTRAINT fk_notifications_expense
    FOREIGN KEY (expense_id) REFERENCES expenses (id)
    ON DELETE CASCADE;

ALTER TABLE notifications
ADD INDEX idx_notifications_user_type_created (user_id, type, created_at DESC);
