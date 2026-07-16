const express = require('express');
const { getGoals, createGoal, updateGoal, deleteGoal } = require('../controllers/goalController');
const authMiddleware = require('../middleware/authMiddleware');
const validateRequest = require('../middleware/validateRequest');
const { idParamValidation } = require('../validators/financeValidators');

const router = express.Router();

router.use(authMiddleware);

router.get('/all', getGoals);
router.post('/add', createGoal);
router.put('/update/:id', idParamValidation, validateRequest, updateGoal);
router.delete('/delete/:id', idParamValidation, validateRequest, deleteGoal);

module.exports = router;
