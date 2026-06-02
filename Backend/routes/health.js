const express = require('express');
const { getHealthScore } = require('../controllers/healthController');
const authMiddleware = require('../middleware/authMiddleware');

const router = express.Router();

router.use(authMiddleware);

router.get('/score', getHealthScore);

module.exports = router;
