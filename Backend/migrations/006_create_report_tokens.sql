-- Report tokens for secure monthly report download links
-- Tokens are short-lived (7 days) and tied to a specific user
CREATE TABLE report_tokens (
    id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    user_id BIGINT UNSIGNED NOT NULL,
    token VARCHAR(64) NOT NULL,
    report_type VARCHAR(50) NOT NULL DEFAULT 'monthly_report',
    report_month DATE NOT NULL,
    expires_at TIMESTAMP NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT fk_report_tokens_user 
        FOREIGN KEY (user_id) REFERENCES users(id) 
        ON DELETE CASCADE,
    CONSTRAINT uq_report_tokens_token UNIQUE (token),
    INDEX idx_report_tokens_user_type (user_id, report_type),
    INDEX idx_report_tokens_expires (expires_at)
) ENGINE=InnoDB;
