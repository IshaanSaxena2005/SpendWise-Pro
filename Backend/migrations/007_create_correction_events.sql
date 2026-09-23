-- Migration: Create correction_events table
-- Append-only historical feedback log used for FUTURE ML training-data curation.
--
-- This table does NOT replace user_category_learning (personalized, live
-- categorization knowledge). correction_events preserves the full history of
-- user category decisions so a curation script can later build a
-- consensus-filtered, anonymized global training export.
--
-- Source values:
--   'accepted'   — first-time categorization (create) or same-category
--                  reinforcement (update): weak, self-confirming signal.
--   'correction' — user changed an existing transaction to a DIFFERENT
--                  category: genuine correction, strong signal.
--
-- PRIVACY: user_id and category_id are internal application data and MUST
-- NEVER appear in any ML training export. The curation script is responsible
-- for anonymizing before anything leaves this database.

CREATE TABLE IF NOT EXISTS correction_events (
    id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    user_id BIGINT UNSIGNED NOT NULL,
    merchant VARCHAR(255) NOT NULL,
    normalized_merchant VARCHAR(255) NOT NULL,
    category_id BIGINT UNSIGNED NOT NULL,
    category_name VARCHAR(60) NOT NULL,
    source ENUM('correction', 'accepted') NOT NULL DEFAULT 'accepted',
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT fk_ce_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
    CONSTRAINT fk_ce_category FOREIGN KEY (category_id) REFERENCES categories(id) ON DELETE CASCADE,
    INDEX idx_ce_normalized_merchant (normalized_merchant),
    INDEX idx_ce_source_created (source, created_at)
) ENGINE=InnoDB;
