const express = require('express');
const { signup, login, updateProfile, verifyEmail, resendVerification, deleteAccount, forgotPassword, resetPassword, getAccountSecurity, updatePassword } = require('../controllers/authController');
const authMiddleware = require('../middleware/authMiddleware');
const validateRequest = require('../middleware/validateRequest');
const { authLimiter } = require('../middleware/rateLimiters');
const {
  signupValidation,
  loginValidation,
  forgotPasswordValidation,
  resetPasswordValidation,
  passwordUpdateValidation,
  profileValidation,
  deleteAccountValidation,
  googleAuthValidation,
} = require('../validators/authValidators');

const router = express.Router();

router.post('/signup', authLimiter, signupValidation, validateRequest, signup);
router.post('/login', authLimiter, loginValidation, validateRequest, login);
router.put('/profile', authMiddleware, profileValidation, validateRequest, updateProfile);
router.get('/verify-email/:token', verifyEmail);
router.post('/resend-verification', forgotPasswordValidation, validateRequest, resendVerification);
router.delete('/delete-account', authMiddleware, deleteAccountValidation, validateRequest, deleteAccount);
router.post('/forgot-password', authLimiter, forgotPasswordValidation, validateRequest, forgotPassword);
router.post('/reset-password', authLimiter, resetPasswordValidation, validateRequest, resetPassword);
router.get('/account-security', authMiddleware, getAccountSecurity);
router.put('/password', authMiddleware, passwordUpdateValidation, validateRequest, updatePassword);

// Google Sign-In
const { googleLogin } = require('../controllers/authController');
router.post('/google', authLimiter, googleAuthValidation, validateRequest, googleLogin);

module.exports = router;
