const express = require('express');
const { generate, getInsights, getRecommendations } = require('../controllers/intelligenceController');
const authMiddleware = require('../middleware/authMiddleware');

const router = express.Router();

router.use(authMiddleware);

router.post('/generate', generate);
router.get('/insights', getInsights);
router.get('/recommendations', getRecommendations);

module.exports = router;
