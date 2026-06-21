const fs = require('fs/promises');
const path = require('path');
const pool = require('../config/db');

const cloudinary = require('cloudinary').v2;
cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET,
});
const uploadsRoot = path.join(__dirname, '..');

// Helper retained for legacy local URLs (not used for Cloudinary)
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
        url: avatar.file_path,
      },
    });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
}

async function uploadAvatar(req, res) {
  let newFilePath;
  let publicId;

  try {
    if (!req.file) {
      return res.status(400).json({
        success: false,
        message: 'Avatar image is required.',
      });
    }

    // Upload temporary file to Cloudinary
    const tempFilePath = req.file.path;
    const uploadResult = await cloudinary.uploader.upload(tempFilePath, {
      folder: 'spendwise-pro/avatars',
      use_filename: true,
      unique_filename: false,
    });
    newFilePath = uploadResult.secure_url; // Store the CDN URL
    publicId = uploadResult.public_id;

    const [existingRows] = await pool.query(
      'SELECT file_path, public_id FROM profile_photos WHERE user_id = ?',
      [req.user.id]
    );
    const oldFilePath = existingRows[0]?.file_path;
    const oldPublicId = existingRows[0]?.public_id;

    await pool.query(
      `INSERT INTO profile_photos (user_id, file_path, public_id)
       VALUES (?, ?, ?)
       ON DUPLICATE KEY UPDATE file_path = VALUES(file_path), public_id = VALUES(public_id), uploaded_at = CURRENT_TIMESTAMP`,
      [req.user.id, newFilePath, publicId]
    );

    // Cleanup temporary local file
    await fs.unlink(tempFilePath);

    // If there was a previous avatar stored on Cloudinary, delete it
    if (oldPublicId && oldPublicId !== publicId) {
      await cloudinary.uploader.destroy(oldPublicId);
    } else if (oldFilePath && !oldFilePath.startsWith('http')) {
      // Legacy local file cleanup
      await deleteAvatarFile(oldFilePath);
    }

    res.status(201).json({
      success: true,
      avatar: {
        file_path: newFilePath,
        url: newFilePath,
        public_id: publicId,
      },
    });
  } catch (err) {
    // Attempt to delete newly uploaded Cloudinary asset on failure
    if (publicId) {
      try {
        await cloudinary.uploader.destroy(publicId);
      } catch {}
    }
    res.status(500).json({ success: false, message: err.message });
  }
}

async function deleteAvatar(req, res) {
  try {
    const [rows] = await pool.query(
      'SELECT file_path, public_id FROM profile_photos WHERE user_id = ?',
      [req.user.id]
    );

    if (rows.length === 0) {
      return res.json({
        success: true,
        message: 'No avatar to delete.',
      });
    }

    const { file_path: filePath, public_id: publicId } = rows[0];
    await pool.query('DELETE FROM profile_photos WHERE user_id = ?', [req.user.id]);

    if (publicId) {
      // Cloudinary hosted avatar
      await cloudinary.uploader.destroy(publicId);
    } else if (filePath && !filePath.startsWith('http')) {
      // Legacy local file
      await deleteAvatarFile(filePath);
    }

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
