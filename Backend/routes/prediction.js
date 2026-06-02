const express = require('express');
const { getBudgetBreachPrediction } = require('../controllers/predictionController');
const authMiddleware = require('../middleware/authMiddleware');

const router = express.Router();

router.use(authMiddleware);

router.get('/budget-breach', getBudgetBreachPrediction);

module.exports = router;
