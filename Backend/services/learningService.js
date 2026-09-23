const pool = require('../config/db');

// Canonical ML class names (must match ML-Service/classifier.py VALID_CLASSES).
// Used to record a resolvable class name on correction events at write time.
const CANONICAL_CATEGORIES = [
  'Food',
  'Shopping',
  'Bills',
  'Travel',
  'Entertainment',
  'Health',
  'Fuel',
  'Salary',
];

const EXACT_CATEGORY_MAP = {
  food: 'Food',
  shopping: 'Shopping',
  bills: 'Bills',
  travel: 'Travel',
  entertainment: 'Entertainment',
  health: 'Health',
  fuel: 'Fuel',
  salary: 'Salary',
};

/**
 * Best-effort map of a user's category NAME to a canonical ML class name.
 * Returns the canonical name, or null when the mapping cannot be made safely
 * (custom/renamed categories are intentionally NOT guessed).
 */
function toCanonicalCategory(categoryName) {
  const name = String(categoryName || '').trim().toLowerCase();
  if (!name) return null;
  if (EXACT_CATEGORY_MAP[name]) return EXACT_CATEGORY_MAP[name];
  // Safeguard: an exact case-insensitive match against a canonical name
  // (covers renamed-but-identical rows like "food" from getOrCreateCanonicalCategories)
  const hit = CANONICAL_CATEGORIES.find((c) => c.toLowerCase() === name);
  return hit || null;
}

function normalizeMerchant(name) {
  return String(name || '')
    .toLowerCase()
    .replace(/[^\w\s-]/g, '') // remove punctuation/special characters except spaces/dashes
    .replace(/[-\s]+/g, ' ') // replace multiple spaces/dashes with a single space
    .trim();
}

/**
 * source: 'correction' = user changed an existing transaction to a DIFFERENT
 * category (genuine correction). 'accepted' = first-time categorization or a
 * same-category update (acceptance/reinforcement).
 */
async function recordCorrectionEvent(userId, merchantName, categoryId, categoryName, source) {
  const normalized = normalizeMerchant(merchantName);
  if (!normalized || !categoryId || !categoryName) return;
  try {
    await pool.query(
      'INSERT INTO correction_events (user_id, merchant, normalized_merchant, category_id, category_name, source) VALUES (?, ?, ?, ?, ?, ?)',
      [userId, String(merchantName).slice(0, 255), normalized.slice(0, 255), categoryId, String(categoryName).slice(0, 60), source]
    );
  } catch (err) {
    // Feedback capture must never break the expense write path.
    console.error('Error recording correction event:', err.message);
  }
}

async function learnFromUserChoice(userId, merchantName, categoryId, options = {}) {
  if (!userId || !merchantName || !categoryId) return;

  const normalized = normalizeMerchant(merchantName);
  if (!normalized) return;

  // ---- Append-only feedback capture (correction vs accepted) ----
  // NEVER replaces user_category_learning: it is historical evidence for
  // future training-data curation only and is not read by the categorizer.
  try {
    const [catRows] = await pool.query('SELECT name FROM categories WHERE id = ? AND user_id = ?', [categoryId, userId]);
    const categoryName = catRows.length > 0 ? catRows[0].name : null;
    const source = options.isCorrection === true ? 'correction' : 'accepted';
    if (categoryName) {
      await recordCorrectionEvent(userId, merchantName, categoryId, categoryName, source);
    }
  } catch (err) {
    console.error('Error capturing correction event:', err.message);
  }

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
  toCanonicalCategory,
  CANONICAL_CATEGORIES,
};
