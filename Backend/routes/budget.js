const express = require('express');
const {
  createBudget,
  getBudgets,
  updateBudget,
  deleteBudget,
} = require('../controllers/budgetController');
const authMiddleware = require('../middleware/authMiddleware');

const router = express.Router();

router.use(authMiddleware);

router.post('/add', createBudget);
router.get('/all', getBudgets);
router.put('/update/:id', updateBudget);
router.delete('/delete/:id', deleteBudget);

module.exports = router;
