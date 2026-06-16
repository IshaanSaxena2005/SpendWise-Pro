const express = require('express');
const { generate, getInsights, getRecommendations } = require('../controllers/intelligenceController');
const authMiddleware = require('../middleware/authMiddleware');
const { aiChatLimiter } = require('../middleware/rateLimiters');

const router = express.Router();

router.use(authMiddleware);

router.post('/generate', aiChatLimiter, generate);
router.get('/insights', getInsights);
router.get('/recommendations', getRecommendations);

module.exports = router;
