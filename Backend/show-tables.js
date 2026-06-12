const mysql = require('mysql2/promise');
require('dotenv').config();

async function showTables() {
  const connection = await mysql.createConnection({
    host: process.env.DB_HOST || 'localhost',
    user: process.env.DB_USER || 'root',
    password: process.env.DB_PASSWORD || 'root',
    database: process.env.DB_NAME || 'smart_financial_intelligence',
  });
  const [rows] = await connection.query('SHOW TABLES');
  console.log(rows);
  await connection.end();
}
showTables();
