require('dotenv').config({ path: require('path').join(__dirname, '../.env') });
const mysql = require('mysql2/promise');

async function main() {
  const config = {
    host: process.env.DB_HOST || 'localhost',
    user: process.env.DB_USER || 'root',
    password: process.env.DB_PASSWORD || 'root',
    database: process.env.DB_NAME || 'smart_financial_intelligence',
    port: process.env.DB_PORT ? Number(process.env.DB_PORT) : 3306,
  };

  console.log('Connecting to database...');
  const conn = await mysql.createConnection(config);
  console.log('Connected.');

  const statements = [
    'ALTER TABLE expenses ADD COLUMN goal_id BIGINT UNSIGNED NULL',
    'ALTER TABLE expenses ADD CONSTRAINT fk_expenses_goal FOREIGN KEY (goal_id) REFERENCES goals(id) ON DELETE SET NULL ON UPDATE CASCADE',
    'CREATE INDEX idx_expenses_goal_id ON expenses(goal_id)'
  ];

  for (const stmt of statements) {
    try {
      console.log(`Executing: "${stmt}"`);
      await conn.query(stmt);
      console.log('Success.');
    } catch (err) {
      if (
        err.code === 'ER_DUP_FIELDNAME' || 
        err.code === 'ER_FK_DUP_NAME' || 
        err.code === 'ER_DUP_KEYNAME' || 
        err.message.includes('Duplicate column') || 
        err.message.includes('Duplicate key')
      ) {
        console.log('Already exists. Skipping.');
      } else {
        throw err;
      }
    }
  }

  await conn.end();
  console.log('Database connection closed.');
}

main().catch(err => {
  console.error('Migration failed:', err);
  process.exit(1);
});
