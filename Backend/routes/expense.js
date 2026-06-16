const express = require('express');
const {
  addExpense,
  getExpenses,
  updateExpense,
  deleteExpense,
} = require('../controllers/expenseController');
const authMiddleware = require('../middleware/authMiddleware');
const validateRequest = require('../middleware/validateRequest');
const { expenseValidation, idParamValidation } = require('../validators/financeValidators');

const router = express.Router();

router.use(authMiddleware);

router.post('/add', expenseValidation, validateRequest, addExpense);
router.get('/all', getExpenses);
router.put('/update/:id', idParamValidation, expenseValidation, validateRequest, updateExpense);
router.delete('/delete/:id', idParamValidation, validateRequest, deleteExpense);

module.exports = router;
    
