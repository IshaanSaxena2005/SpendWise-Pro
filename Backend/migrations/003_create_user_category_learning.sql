-- Migration: Create user_category_learning and merchant_aliases tables
-- For SpendWise Pro self-learning AI smart categorization engine

CREATE TABLE IF NOT EXISTS user_category_learning (
    id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    user_id BIGINT UNSIGNED NOT NULL,
    merchant VARCHAR(255) NOT NULL,
    normalized_merchant VARCHAR(255) NOT NULL,
    category_id BIGINT UNSIGNED NOT NULL,
    times_used INT NOT NULL DEFAULT 1,
    confidence DECIMAL(5,2) NOT NULL DEFAULT 70.00,
    last_used TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    CONSTRAINT fk_ucl_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
    CONSTRAINT fk_ucl_category FOREIGN KEY (category_id) REFERENCES categories(id) ON DELETE CASCADE,
    CONSTRAINT uq_ucl_user_merchant UNIQUE (user_id, normalized_merchant)
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS merchant_aliases (
    id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    merchant VARCHAR(255) NOT NULL,
    alias VARCHAR(255) NOT NULL,
    category_name VARCHAR(100) NOT NULL,
    CONSTRAINT uq_ma_merchant_alias UNIQUE (merchant, alias)
) ENGINE=InnoDB;
