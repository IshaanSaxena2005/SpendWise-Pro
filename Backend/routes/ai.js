const express = require('express');
const { chat } = require('../controllers/aiChatController');
const { categorize } = require('../controllers/categorizeController');
const authMiddleware = require('../middleware/authMiddleware');
const { aiChatLimiter, aiCategorizeLimiter } = require('../middleware/rateLimiters');

const router = express.Router();

router.post('/chat', authMiddleware, aiChatLimiter, chat);
router.post('/categorize', authMiddleware, aiCategorizeLimiter, categorize);

module.exports = router;
