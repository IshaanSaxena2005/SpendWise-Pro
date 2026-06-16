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
      database: process.env.DB_NAME || 'smart_financial_intelligence',
    });

    console.log('Connected to DB');

    if (!(await columnExists(connection, 'categories', 'icon'))) {
      await connection.query(
        "ALTER TABLE categories ADD COLUMN icon VARCHAR(20) NOT NULL DEFAULT '📁' AFTER name"
      );
      console.log('Added categories.icon');
    }

    if (!(await columnExists(connection, 'categories', 'color'))) {
      await connection.query(
        "ALTER TABLE categories ADD COLUMN color VARCHAR(20) NOT NULL DEFAULT '#6B7280' AFTER icon"
      );
      console.log('Added categories.color');
    }

    if (!(await columnExists(connection, 'categories', 'bg'))) {
      await connection.query(
        "ALTER TABLE categories ADD COLUMN bg VARCHAR(20) NOT NULL DEFAULT '#F3F4F6' AFTER color"
      );
      console.log('Added categories.bg');
    }

    console.log('Category metadata migration complete');
  } catch (error) {
    console.error('Migration failed:', error);
    process.exitCode = 1;
  } finally {
    if (connection) await connection.end();
  }
}

migrate();
