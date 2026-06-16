const express = require('express');
const authMiddleware = require('../middleware/authMiddleware');
const { getAnomalyHistory } = require('../services/anomalyService');

const router = express.Router();
router.use(authMiddleware);

router.get('/check', async (req, res) => {
  try {
    const userId = req.user.id;
    const anomalies = await getAnomalyHistory(userId);
    res.json({ success: true, anomalies });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

module.exports = router;
