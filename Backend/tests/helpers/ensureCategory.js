/**
 * Race-safe category creation for tests.
 *
 * UNIQUE (user_id, name) is enforced, and node --test runs test FILES in
 * parallel against one shared database. Startup migrations legitimately seed
 * canonical categories for EVERY user, so a fixture inserting e.g. "Food" can
 * collide with a row another test file's user just gained. This helper
 * re-uses the existing row and retries once on a duplicate-key race.
 */
const pool = require('../../config/db');

async function ensureCategory(userId, name) {
  for (let attempt = 0; attempt < 3; attempt++) {
    const [rows] = await pool.query(
      'SELECT id FROM categories WHERE user_id = ? AND name = ? LIMIT 1',
      [userId, name]
    );
    if (rows.length > 0) return rows[0].id;
    try {
      const [result] = await pool.query('INSERT INTO categories (user_id, name) VALUES (?, ?)', [userId, name]);
      return result.insertId;
    } catch (err) {
      if (err && err.code !== 'ER_DUP_ENTRY') throw err; // concurrent insert won; re-read
    }
  }
  throw new Error(`could not obtain category "${name}" for user ${userId}`);
}

module.exports = { ensureCategory };