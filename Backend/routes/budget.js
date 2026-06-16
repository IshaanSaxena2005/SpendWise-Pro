const express = require('express');
const {
  createBudget,
  getBudgets,
  updateBudget,
  deleteBudget,
} = require('../controllers/budgetController');
const authMiddleware = require('../middleware/authMiddleware');
const validateRequest = require('../middleware/validateRequest');
const { budgetValidation, idParamValidation } = require('../validators/financeValidators');

const router = express.Router();

router.use(authMiddleware);

router.post('/add', budgetValidation, validateRequest, createBudget);
router.get('/all', getBudgets);
router.put('/update/:id', idParamValidation, budgetValidation, validateRequest, updateBudget);
router.delete('/delete/:id', idParamValidation, validateRequest, deleteBudget);

module.exports = router;
