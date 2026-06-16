const mysql = require('mysql2/promise');
require('dotenv').config();

async function migrate() {
  try {
    const connection = await mysql.createConnection({
      host: process.env.DB_HOST || 'localhost',
      user: process.env.DB_USER || 'root',
      password: process.env.DB_PASSWORD || 'root',
      database: process.env.DB_NAME || 'smart_financial_intelligence',
    });

    console.log('Connected to DB');

    await connection.query('ALTER TABLE users ADD COLUMN is_verified BOOLEAN DEFAULT FALSE');
    console.log('Added is_verified column');

    await connection.query('ALTER TABLE users ADD COLUMN verification_token VARCHAR(255) NULL');
    console.log('Added verification_token column');

    await connection.query('UPDATE users SET is_verified = TRUE');
    console.log('Grandfathered existing users');

    await connection.end();
    console.log('Migration complete');
  } catch (error) {
    console.error('Migration failed:', error);
  }
}

migrate();
