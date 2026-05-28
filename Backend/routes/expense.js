const express = require('express');
const {
  addExpense,
  getExpenses,
  updateExpense,
  deleteExpense,
} = require('../controllers/expenseController');

const router = express.Router();

router.post('/add', addExpense);
router.get('/all', getExpenses);
router.put('/update/:id', updateExpense);
router.delete('/delete/:id', deleteExpense);

module.exports = router;
