const express = require('express');
const router = express.Router();
const recurringController = require('../controllers/recurringController');
const authMiddleware = require('../middleware/authMiddleware');

router.use(authMiddleware);

// GET all recurring templates for user
router.get('/', recurringController.getAll);
// CREATE new template
router.post('/', recurringController.create);
// UPDATE template
router.put('/:id', recurringController.update);
// DELETE template
router.delete('/:id', recurringController.remove);
// PAUSE template
router.patch('/:id/pause', recurringController.pause);
// RESUME template
router.patch('/:id/resume', recurringController.resume);

module.exports = router;
