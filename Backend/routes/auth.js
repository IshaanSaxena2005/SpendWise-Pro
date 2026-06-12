const express = require('express');
const { signup, login, updateProfile, verifyEmail, resendVerification, deleteAccount, forgotPassword, resetPassword } = require('../controllers/authController');
const authMiddleware = require('../middleware/authMiddleware');

const router = express.Router();

router.post('/signup', signup);
router.post('/login', login);
router.put('/profile', authMiddleware, updateProfile);
router.get('/verify-email/:token', verifyEmail);
router.post('/resend-verification', resendVerification);
router.delete('/delete-account', authMiddleware, deleteAccount);
router.post('/forgot-password', forgotPassword);
router.post('/reset-password', resetPassword);

module.exports = router;
