const mysql = require('mysql2/promise');

const DB = {
  host: process.env.DB_HOST || 'localhost',
  user: process.env.DB_USER || 'root',
  password: process.env.DB_PASSWORD || 'root',
  database: process.env.DB_NAME || 'smart_financial_intelligence',
};

async function main() {
  const conn = await mysql.createConnection({ ...DB, multipleStatements: true });
  console.log('Connected');

  const patches = [
    `ALTER TABLE expenses ADD COLUMN is_recurring BOOLEAN DEFAULT FALSE`,
    `ALTER TABLE expenses ADD COLUMN recurring_transaction_id BIGINT UNSIGNED NULL`,
    `ALTER TABLE expenses ADD COLUMN updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP`,
    `ALTER TABLE expenses ADD COLUMN title VARCHAR(255) NULL AFTER note`,
    `ALTER TABLE budgets ADD COLUMN updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP`,
    `ALTER TABLE users ADD COLUMN is_verified BOOLEAN DEFAULT FALSE`,
    `ALTER TABLE users ADD COLUMN verification_token VARCHAR(255) NULL`,
    `ALTER TABLE notifications ADD COLUMN read BOOLEAN DEFAULT FALSE`,
    `ALTER TABLE notifications CHANGE COLUMN read_status read_status_old BOOLEAN`,
    `ALTER TABLE categories ADD COLUMN color VARCHAR(32) NULL`,
    `ALTER TABLE profile_photos ADD COLUMN public_id VARCHAR(255) NULL`,
  ];

  for (const sql of patches) {
    try {
      await conn.query(sql);
      console.log('OK:', sql.split(' ADD COLUMN ')[1] || sql.slice(0, 80));
    } catch (e) {
      console.log('skip:', e.message.split('\n')[0]);
    }
  }

  const needRecTable = `CREATE TABLE IF NOT EXISTS recurring_transactions (
    id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    user_id BIGINT UNSIGNED NOT NULL,
    linked_transaction_id BIGINT UNSIGNED NULL,
    type ENUM('income', 'expense') NOT NULL,
    amount DECIMAL(12,2) NOT NULL,
    category_id BIGINT UNSIGNED NULL,
    note VARCHAR(500) NULL,
    frequency ENUM('daily','weekly','monthly','yearly') NOT NULL,
    start_date DATE NOT NULL,
    end_date DATE NULL,
    next_execution_date DATE NOT NULL,
    never_ends BOOLEAN DEFAULT FALSE,
    is_active BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
  ) ENGINE=InnoDB`;
  try { await conn.query(needRecTable); console.log('recurring_transactions table OK'); } catch(e){ console.log(e.message); }

  const needTables = [
    `CREATE TABLE IF NOT EXISTS goals (
      id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    user_id BIGINT UNSIGNED NOT NULL,
    name VARCHAR(255) NOT NULL,
    icon VARCHAR(10) NULL,
    category VARCHAR(100) NULL,
    target_amount DECIMAL(12,2) NOT NULL,
    saved_amount DECIMAL(12,2) NOT NULL DEFAULT 0,
    monthly_contribution DECIMAL(12,2) NOT NULL DEFAULT 0,
    target_date DATE NOT NULL,
    priority ENUM('High','Medium','Low') NOT NULL DEFAULT 'Medium',
    notes TEXT NULL,
    is_completed BOOLEAN NOT NULL DEFAULT FALSE,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
  ) ENGINE=InnoDB`,
    `CREATE TABLE IF NOT EXISTS password_resets (
      id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
      user_id BIGINT UNSIGNED NOT NULL,
      token VARCHAR(255) NOT NULL,
      expires_at TIMESTAMP NOT NULL,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    ) ENGINE=InnoDB`,
    `CREATE TABLE IF NOT EXISTS ai_insights (
      id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
      user_id BIGINT UNSIGNED NOT NULL,
      title VARCHAR(255) NOT NULL,
      description TEXT NOT NULL,
      type VARCHAR(50) NOT NULL,
      severity VARCHAR(50) NOT NULL,
      confidence_score DECIMAL(5,2) NOT NULL,
      category VARCHAR(100) NULL,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    ) ENGINE=InnoDB`,
    `CREATE TABLE IF NOT EXISTS recommendations (
      id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
      user_id BIGINT UNSIGNED NOT NULL,
      title VARCHAR(255) NOT NULL,
      description TEXT NOT NULL,
      impact_score DECIMAL(5,2) NOT NULL,
      category VARCHAR(100) NULL,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    ) ENGINE=InnoDB`,
    `CREATE TABLE IF NOT EXISTS financial_health (
      id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
      user_id BIGINT UNSIGNED NOT NULL,
      score INT NOT NULL,
      rating VARCHAR(20) NOT NULL,
      factors JSON NULL,
      recommendations TEXT NULL,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    ) ENGINE=InnoDB`,
    `CREATE TABLE IF NOT EXISTS profile_photos (
      id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
      user_id BIGINT UNSIGNED NOT NULL UNIQUE,
      file_path VARCHAR(255) NOT NULL,
      public_id VARCHAR(255) NULL,
      uploaded_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    ) ENGINE=InnoDB`,
  ];

  for (const t of needTables) {
    try { await conn.query(t); console.log('table ensured:', t.match(/IF NOT EXISTS (\w+)/)?.[1] || '?'); }
    catch (e) { console.log('ensure table error:', e.message); }
  }

  await conn.end();
  console.log('\nDone');
}

main().catch((e) => { console.error(e); process.exit(1); });
