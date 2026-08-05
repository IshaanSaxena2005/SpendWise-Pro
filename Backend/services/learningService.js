const pool = require('../config/db');

function normalizeMerchant(name) {
  return String(name || '')
    .toLowerCase()
    .replace(/[^\w\s-]/g, '') // remove punctuation/special characters except spaces/dashes
    .replace(/[-\s]+/g, ' ') // replace multiple spaces/dashes with a single space
    .trim();
}

async function learnFromUserChoice(userId, merchantName, categoryId) {
  if (!userId || !merchantName || !categoryId) return;

  const normalized = normalizeMerchant(merchantName);
  if (!normalized) return;

  try {
    const [existing] = await pool.query(
      'SELECT id, category_id, times_used, confidence FROM user_category_learning WHERE user_id = ? AND normalized_merchant = ?',
      [userId, normalized]
    );

    if (existing.length > 0) {
      const row = existing[0];
      if (Number(row.category_id) === Number(categoryId)) {
        // Confirmed mapping -> increase confidence (cap at 99) and times_used
        const newConfidence = Math.min(99.00, Number(row.confidence) + 5.00);
        await pool.query(
          'UPDATE user_category_learning SET times_used = times_used + 1, confidence = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?',
          [newConfidence, row.id]
        );
      } else {
        // User changed/corrected category -> reset mapping and set starting confidence to 70
        await pool.query(
          'UPDATE user_category_learning SET category_id = ?, times_used = 1, confidence = 70.00, updated_at = CURRENT_TIMESTAMP WHERE id = ?',
          [categoryId, row.id]
        );
      }
    } else {
      // New mapping -> insert with initial confidence 70
      await pool.query(
        'INSERT INTO user_category_learning (user_id, merchant, normalized_merchant, category_id, times_used, confidence) VALUES (?, ?, ?, ?, 1, 70.00)',
        [userId, merchantName, normalized, categoryId]
      );
    }
  } catch (err) {
    console.error('Error in learning service:', err);
  }
}

module.exports = {
  learnFromUserChoice,
  normalizeMerchant,
};
