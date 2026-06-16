const mysql = require('mysql2/promise');
require('dotenv').config();

async function columnExists(connection, table, column) {
  const [rows] = await connection.query(
    `SELECT COUNT(*) AS cnt
     FROM information_schema.COLUMNS
     WHERE TABLE_SCHEMA = DATABASE()
       AND TABLE_NAME = ?
       AND COLUMN_NAME = ?`,
    [table, column]
  );
  return rows[0].cnt > 0;
}

async function migrate() {
  let connection;
  try {
    connection = await mysql.createConnection({
      host: process.env.DB_HOST || 'localhost',
      user: process.env.DB_USER || 'root',
      password: process.env.DB_PASSWORD || 'root',
      database: process.env.DB_NAME || 'spendwise',
    });

    if (!(await columnExists(connection, 'expenses', 'transaction_type'))) {
      await connection.query(
        "ALTER TABLE expenses ADD COLUMN transaction_type ENUM('expense', 'income') NOT NULL DEFAULT 'expense' AFTER amount"
      );
      console.log('Added expenses.transaction_type');
    } else {
      console.log('expenses.transaction_type already exists');
    }

    console.log('Migration complete');
  } catch (err) {
    console.error('Migration failed:', err.message);
    process.exit(1);
  } finally {
    if (connection) await connection.end();
  }
}

migrate();
