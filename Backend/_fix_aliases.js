require('dotenv').config();
const pool = require('./config/db');

async function fix() {
  console.log('Fixing merchant_aliases category names...');

  // 1. Fix Healthcare -> Health
  const [r1] = await pool.query(
    `UPDATE merchant_aliases SET category_name = 'Health' WHERE category_name IN ('Healthcare', 'Medical')`
  );
  console.log(`  Updated Healthcare -> Health: ${r1.affectedRows} rows`);

  // 2. Fix Income -> Salary
  const [r2] = await pool.query(
    `UPDATE merchant_aliases SET category_name = 'Salary' WHERE category_name IN ('Income', 'Earnings')`
  );
  console.log(`  Updated Income -> Salary: ${r2.affectedRows} rows`);

  // 3. Fix fuel-related Travel aliases -> Fuel
  const fuelKeywords = ['shell fuel', 'indian oil', 'hp petrol', 'bpcl', 'shell', 'indianoil'];
  let fuelFixed = 0;
  for (const kw of fuelKeywords) {
    const [r] = await pool.query(
      `UPDATE merchant_aliases SET category_name = 'Fuel' WHERE category_name = 'Travel' AND (merchant LIKE ? OR alias LIKE ?)`,
      [`%${kw}%`, `%${kw}%`]
    );
    fuelFixed += r.affectedRows;
  }
  console.log(`  Updated fuel Travel -> Fuel: ${fuelFixed} rows`);

  // 4. Also delete any existing 'apollo' alias with wrong category so re-insert works
  await pool.query(
    `DELETE FROM merchant_aliases WHERE alias IN ('apollo','apollo medical','medplus','shell fuel','indian oil','hp petrol','bpcl')`
  );

  // 5. Re-seed with correct categories
  const { SEED_MERCHANT_ALIASES } = require('./constants/merchantAliasesSeed');
  for (const s of SEED_MERCHANT_ALIASES) {
    await pool.query(
      `INSERT IGNORE INTO merchant_aliases (merchant, alias, category_name) VALUES (?, ?, ?)`,
      [s.merchant, s.alias, s.category]
    );
  }
  console.log(`  Re-seeded ${SEED_MERCHANT_ALIASES.length} aliases with correct categories`);

  // Verify
  const [rows] = await pool.query('SELECT alias, merchant, category_name FROM merchant_aliases ORDER BY category_name');
  console.log('\nCurrent merchant_aliases:');
  for (const r of rows) {
    console.log(`  [${r.category_name}] ${r.alias} -> ${r.merchant}`);
  }

  pool.end();
  console.log('\nDone.');
}

fix().catch(e => { console.error(e.message); process.exit(1); });
