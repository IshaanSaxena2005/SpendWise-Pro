const { body, param } = require('express-validator');
const pool = require('../config/db');

const idParamValidation = [
  param('id')
    .isInt({ min: 1 }).withMessage('Invalid id')
    .toInt(),
];

const categoryExistsForUser = async (categoryId, { req }) => {
  const [rows] = await pool.query(
    'SELECT id FROM categories WHERE id = ? AND user_id = ?',
    [categoryId, req.user.id]
  );

  if (rows.length === 0) {
    throw new Error('Invalid category');
  }
};

const expenseValidation = [
  body('amount')
    .isFloat({ gt: 0 }).withMessage('Amount must be greater than 0')
    .toFloat(),
  body('category_id')
    .isInt({ min: 1 }).withMessage('Invalid category')
    .toInt()
    .custom(categoryExistsForUser),
  body('expense_date')
    .isISO8601({ strict: true }).withMessage('Invalid date')
    .toDate(),
  body()
    .custom((value, { req }) => {
      const title = typeof req.body.title === 'string' ? req.body.title.trim() : '';
      const note = typeof req.body.note === 'string' ? req.body.note.trim() : '';
      if (!title && !note) {
        throw new Error('Title is required');
      }
      return true;
    }),
  body('title')
    .optional()
    .trim()
    .isLength({ min: 1, max: 500 }).withMessage('Title must be 1-500 characters'),
  body('note')
    .optional()
    .trim()
    .isLength({ max: 500 }).withMessage('Note must be 500 characters or fewer'),
  body('transaction_type')
    .optional()
    .isIn(['expense', 'income']).withMessage('Invalid transaction type'),
];

const categoryValidation = [
  body('name')
    .trim()
    .notEmpty().withMessage('Category name is required')
    .isLength({ min: 1, max: 50 }).withMessage('Category name must be 1-50 characters'),
  body('icon')
    .optional()
    .trim()
    .isLength({ min: 1, max: 20 }).withMessage('Icon must be 1-20 characters'),
  body('color')
    .optional()
    .matches(/^#[0-9A-Fa-f]{6}$/).withMessage('Color must be a valid hex code'),
  body('bg')
    .optional()
    .matches(/^#[0-9A-Fa-f]{6}$/).withMessage('Background must be a valid hex code'),
];

const budgetValidation = [
  body('amount_limit')
    .isFloat({ gt: 0 }).withMessage('Amount must be greater than 0')
    .toFloat(),
  body('month')
    .isISO8601({ strict: true }).withMessage('Invalid month')
    .custom(value => {
      if (!/^\d{4}-\d{2}-01$/.test(value)) {
        throw new Error('Month must be the first day of a valid month');
      }
      return true;
    }),
  body('category_id')
    .optional({ nullable: true, checkFalsy: true })
    .isInt({ min: 1 }).withMessage('Invalid category')
    .toInt()
    .custom(categoryExistsForUser),
];

const goalValidation = [
  body('target_amount')
    .isFloat({ gt: 0 }).withMessage('Target amount must be greater than 0')
    .toFloat(),
  body('target_date')
    .isISO8601({ strict: true }).withMessage('Invalid target date')
    .toDate(),
];

// Goals API is not currently implemented. Validation middleware for goals is already prepared and can be enabled when the feature is added.

module.exports = {
  idParamValidation,
  expenseValidation,
  categoryValidation,
  budgetValidation,
  goalValidation,
};
