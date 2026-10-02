const { body, param } = require('express-validator');
const { categoryExistsForUser } = require('./financeValidators');

const recurringValidation = [
  body('type')
    .isIn(['income', 'expense']).withMessage('Type must be either income or expense'),
  body('amount')
    .isFloat({ gt: 0, max: 100000000 }).withMessage('Amount must be greater than 0 and less than ₹10 Crore')
    .toFloat(),
  body('category_id')
    .optional({ nullable: true, checkFalsy: true })
    .isInt({ min: 1 }).withMessage('Invalid category')
    .toInt()
    .custom(categoryExistsForUser),
  body('frequency')
    .isIn(['daily', 'weekly', 'monthly', 'yearly']).withMessage('Invalid frequency'),
  body('start_date')
    .isISO8601({ strict: true }).withMessage('Invalid start date')
    .toDate(),
  // Optional: the date of the first transaction the user typed when creating
  // the schedule. It is kept separate from start_date because the add-transaction
  // form exposes both fields independently.
  body('first_transaction_date')
    .optional({ nullable: true, checkFalsy: true })
    .isISO8601({ strict: true }).withMessage('Invalid first transaction date'),
  // Set only when the caller already created that first transaction itself
  // (converting an existing transaction into a recurring one).
  body('skip_first_transaction')
    .optional({ nullable: true })
    .isBoolean().withMessage('Skip first transaction must be a boolean'),
  body('end_date')
    .optional({ nullable: true, checkFalsy: true })
    .isISO8601({ strict: true }).withMessage('Invalid end date')
    .toDate()
    .custom((value, { req }) => {
      if (value && req.body.start_date && new Date(value) < new Date(req.body.start_date)) {
        throw new Error('End date must be after start date');
      }
      return true;
    }),
  body('never_ends')
    .optional()
    .isBoolean().withMessage('Never ends must be a boolean'),
  body('note')
    .optional()
    .trim()
    .isLength({ max: 500 }).withMessage('Note must be 500 characters or fewer'),
];

module.exports = {
  recurringValidation,
  idParamValidation: [
    param('id')
      .isInt({ min: 1 }).withMessage('Invalid id')
      .toInt(),
  ],
};
