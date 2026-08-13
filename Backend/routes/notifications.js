const express = require('express');
const { getNotifications, markAsRead, markAllAsRead, getPreferences, updatePreferences } = require('../controllers/notificationController');
const authMiddleware = require('../middleware/authMiddleware');

const router = express.Router();

router.use(authMiddleware);

router.get('/preferences', getPreferences);
router.put('/preferences', updatePreferences);
router.get('/', getNotifications);
router.put('/read-all', markAllAsRead);
router.put('/:id/read', markAsRead);

module.exports = router;
