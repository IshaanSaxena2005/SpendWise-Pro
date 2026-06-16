const fs = require('fs/promises');
const path = require('path');
const pool = require('../config/db');

const uploadsRoot = path.join(__dirname, '..');

function toPublicUrl(req, filePath) {
  if (!filePath) return null;
  const normalized = filePath.replace(/\\/g, '/');
  return `${req.protocol}://${req.get('host')}/${normalized}`;
}

async function deleteAvatarFile(filePath) {
  if (!filePath) return;

  const absolutePath = path.resolve(uploadsRoot, filePath);
  const avatarsDir = path.resolve(uploadsRoot, 'uploads', 'avatars');

  if (!absolutePath.startsWith(avatarsDir + path.sep)) return;

  try {
    await fs.unlink(absolutePath);
  } catch (err) {
    if (err.code !== 'ENOENT') {
      throw err;
    }
  }
}

async function getAvatar(req, res) {
  try {
    const [rows] = await pool.query(
      'SELECT id, user_id, file_path, uploaded_at FROM profile_photos WHERE user_id = ?',
      [req.user.id]
    );

    if (rows.length === 0) {
      return res.json({
        success: true,
        avatar: null,
      });
    }

    const avatar = rows[0];
    res.json({
      success: true,
      avatar: {
        id: avatar.id,
        user_id: avatar.user_id,
        file_path: avatar.file_path,
        uploaded_at: avatar.uploaded_at,
        url: toPublicUrl(req, avatar.file_path),
      },
    });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
}

async function uploadAvatar(req, res) {
  let newFilePath;

  try {
    if (!req.file) {
      return res.status(400).json({
        success: false,
        message: 'Avatar image is required.',
      });
    }

    newFilePath = path.posix.join('uploads', 'avatars', req.file.filename);

    const [existingRows] = await pool.query(
      'SELECT file_path FROM profile_photos WHERE user_id = ?',
      [req.user.id]
    );
    const oldFilePath = existingRows[0]?.file_path;

    await pool.query(
      `INSERT INTO profile_photos (user_id, file_path)
       VALUES (?, ?)
       ON DUPLICATE KEY UPDATE file_path = VALUES(file_path), uploaded_at = CURRENT_TIMESTAMP`,
      [req.user.id, newFilePath]
    );

    if (oldFilePath && oldFilePath !== newFilePath) {
      await deleteAvatarFile(oldFilePath);
    }

    res.status(201).json({
      success: true,
      avatar: {
        file_path: newFilePath,
        url: toPublicUrl(req, newFilePath),
      },
    });
  } catch (err) {
    if (newFilePath) {
      try {
        await deleteAvatarFile(newFilePath);
      } catch {
        // Best-effort cleanup after a failed upload.
      }
    }
    res.status(500).json({ success: false, message: err.message });
  }
}

async function deleteAvatar(req, res) {
  try {
    const [rows] = await pool.query(
      'SELECT file_path FROM profile_photos WHERE user_id = ?',
      [req.user.id]
    );

    if (rows.length === 0) {
      return res.json({
        success: true,
        message: 'No avatar to delete.',
      });
    }

    const filePath = rows[0].file_path;
    await pool.query('DELETE FROM profile_photos WHERE user_id = ?', [req.user.id]);
    await deleteAvatarFile(filePath);

    res.json({
      success: true,
      message: 'Avatar deleted successfully.',
    });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
}

module.exports = {
  getAvatar,
  uploadAvatar,
  deleteAvatar,
};
