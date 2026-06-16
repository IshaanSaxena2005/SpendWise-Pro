const express = require('express');
const { chat } = require('../controllers/aiChatController');
const authMiddleware = require('../middleware/authMiddleware');
const { aiChatLimiter } = require('../middleware/rateLimiters');

const router = express.Router();

router.post('/chat', authMiddleware, aiChatLimiter, chat);

module.exports = router;
