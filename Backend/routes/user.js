const express = require('express');
const multer = require('multer');
const path = require('path');
const authMiddleware = require('../middleware/authMiddleware');
const { getAvatar, uploadAvatar, deleteAvatar } = require('../controllers/userController');

const router = express.Router();

const allowedMimeTypes = new Set([
  'image/jpeg',
  'image/png',
  'image/webp',
]);

const storage = multer.diskStorage({
  destination: path.join(__dirname, '..', 'uploads', 'avatars'),
  filename: (req, file, cb) => {
    const ext = path.extname(file.originalname).toLowerCase();
    cb(null, `${req.user.id}-${Date.now()}${ext}`);
  },
});

const upload = multer({
  storage,
  limits: {
    fileSize: 5 * 1024 * 1024,
  },
  fileFilter: (req, file, cb) => {
    const ext = path.extname(file.originalname).toLowerCase();
    const allowedExt = ['.jpg', '.jpeg', '.png', '.webp'].includes(ext);

    if (allowedMimeTypes.has(file.mimetype) && allowedExt) {
      cb(null, true);
      return;
    }

    cb(new Error('Only JPG, JPEG, PNG, and WEBP images are allowed.'));
  },
});

function uploadAvatarMiddleware(req, res, next) {
  upload.single('avatar')(req, res, (err) => {
    if (!err) {
      if (process.env.NODE_ENV !== 'production') {
        console.warn('[AvatarUpload] multer req.file:', req.file);
      }
      next();
      return;
    }

    const message = err.code === 'LIMIT_FILE_SIZE'
      ? 'Avatar image must be 5 MB or smaller.'
      : err.message;

    res.status(400).json({
      success: false,
      message,
    });
  });
}

router.get('/avatar', authMiddleware, getAvatar);
router.post('/avatar', authMiddleware, uploadAvatarMiddleware, uploadAvatar);
router.delete('/avatar', authMiddleware, deleteAvatar);

module.exports = router;
