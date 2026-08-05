require('dotenv').config({ path: require('path').join(__dirname, '../.env') });
const fs = require('fs');
const path = require('path');
const mysql = require('mysql2/promise');

async function main() {
  const config = {
    host: process.env.DB_HOST || 'localhost',
    user: process.env.DB_USER || 'root',
    password: process.env.DB_PASSWORD || 'root',
    database: process.env.DB_NAME || 'smart_financial_intelligence',
    port: process.env.DB_PORT ? Number(process.env.DB_PORT) : 3306,
    multipleStatements: true
  };

  console.log('Connecting to database...');
  const conn = await mysql.createConnection(config);
  console.log('Connected.');

  const migrationPath = path.join(__dirname, '../migrations/003_create_user_category_learning.sql');
  console.log('Reading migration file:', migrationPath);
  const sql = fs.readFileSync(migrationPath, 'utf8');

  console.log('Applying migration...');
  await conn.query(sql);
  console.log('Migration applied successfully.');

  // Seed the merchant_aliases table
  const { SEED_MERCHANT_ALIASES } = require('../constants/merchantAliasesSeed');
  console.log(`Seeding ${SEED_MERCHANT_ALIASES.length} merchant aliases...`);
  for (const s of SEED_MERCHANT_ALIASES) {
    await conn.query(
      'INSERT IGNORE INTO merchant_aliases (merchant, alias, category_name) VALUES (?, ?, ?)',
      [s.merchant, s.alias, s.category]
    );
  }
  console.log('Seeding completed.');

  await conn.end();
  console.log('Database connection closed.');
}

main().catch(err => {
  console.error('Migration failed:', err);
  process.exit(1);
});
