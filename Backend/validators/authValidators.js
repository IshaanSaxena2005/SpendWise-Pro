const { body } = require('express-validator');

const signupValidation = [
  body('full_name')
    .trim()
    .notEmpty().withMessage('Full name is required')
    .isLength({ min: 2, max: 100 }).withMessage('Full name must be 2-100 characters'),
  body('email')
    .trim()
    .isEmail().withMessage('Invalid email')
    .normalizeEmail(),
  body('password')
    .isLength({ min: 6 }).withMessage('Password must be at least 6 characters'),
];

const loginValidation = [
  body('email')
    .trim()
    .isEmail().withMessage('Invalid email')
    .normalizeEmail(),
  body('password')
    .notEmpty().withMessage('Password is required'),
];

const forgotPasswordValidation = [
  body('email')
    .trim()
    .isEmail().withMessage('Invalid email')
    .normalizeEmail(),
];

const resetPasswordValidation = [
  body('email')
    .trim()
    .isEmail().withMessage('Invalid email')
    .normalizeEmail(),
  body('token')
    .trim()
    .notEmpty().withMessage('Reset token is required'),
  body('newPassword')
    .isLength({ min: 6 }).withMessage('Password must be at least 6 characters'),
];

const passwordUpdateValidation = [
  body('newPassword')
    .isLength({ min: 6 }).withMessage('Password must be at least 6 characters'),
  body('currentPassword')
    .optional()
    .isString().withMessage('Current password must be a string'),
];

const googleAuthValidation = [
  body('token')
    .trim()
    .notEmpty().withMessage('Google ID token is required'),
];

const profileValidation = [
  body('full_name')
    .trim()
    .notEmpty().withMessage('Full name is required')
    .isLength({ min: 2, max: 100 }).withMessage('Full name must be 2-100 characters'),
];

const deleteAccountValidation = [];

module.exports = {
  signupValidation,
  loginValidation,
  forgotPasswordValidation,
  resetPasswordValidation,
  passwordUpdateValidation,
  profileValidation,
  deleteAccountValidation,
  googleAuthValidation,
};
