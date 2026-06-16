const express = require('express');
const {
  createCategory,
  getCategories,
  updateCategory,
  deleteCategory,
} = require('../controllers/categoryController');
const authMiddleware = require('../middleware/authMiddleware');
const validateRequest = require('../middleware/validateRequest');
const { categoryValidation, idParamValidation } = require('../validators/financeValidators');

const router = express.Router();

router.use(authMiddleware);

router.post('/add', categoryValidation, validateRequest, createCategory);
router.get('/all', getCategories);
router.put('/update/:id', idParamValidation, categoryValidation, validateRequest, updateCategory);
router.delete('/delete/:id', idParamValidation, validateRequest, deleteCategory);

module.exports = router;
