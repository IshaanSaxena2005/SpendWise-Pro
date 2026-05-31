const express = require('express');
const {
  createCategory,
  getCategories,
  updateCategory,
  deleteCategory,
} = require('../controllers/categoryController');
const authMiddleware = require('../middleware/authMiddleware');

const router = express.Router();

router.use(authMiddleware);

router.post('/add', createCategory);
router.get('/all', getCategories);
router.put('/update/:id', updateCategory);
router.delete('/delete/:id', deleteCategory);

module.exports = router;
