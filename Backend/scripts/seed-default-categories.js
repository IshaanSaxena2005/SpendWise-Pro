require('dotenv').config();
const pool = require('../config/db');

const defaultCategories = [
  'Food',
  'Shopping',
  'Travel',
  'Entertainment',
  'Bills',
  'Health',
  'Salary',
  'Freelance'
];

async function seedCategories() {
  try {
    console.log('Starting default categories seed...');

    // Get all users
    const [users] = await pool.query('SELECT id FROM users');
    console.log(`Found ${users.length} users.`);

    for (const user of users) {
      console.log(`Processing user ${user.id}...`);
      for (const categoryName of defaultCategories) {
        await pool.query(
          'INSERT IGNORE INTO categories (user_id, name) VALUES (?, ?)',
          [user.id, categoryName]
        );
      }
    }

    console.log('✅ Default categories seeded successfully!');
    process.exit(0);
  } catch (err) {
    console.error('❌ Error seeding categories:', err);
    process.exit(1);
  }
}

seedCategories();
