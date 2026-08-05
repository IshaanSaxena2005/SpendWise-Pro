const { categorizeTransaction } = require('../services/categorizeService');

const categorize = async (req, res) => {
  try {
    const { description } = req.body || {};

    if (!description || typeof description !== 'string' || !description.trim()) {
      return res.status(200).json({
        success: true,
        category: null,
        confidence: 0,
        source: null,
        matched_text: null
      });
    }

    const userId = req.user?.id || null;
    const result = await categorizeTransaction(userId, description);

    return res.status(200).json({
      success: true,
      category: result.category,
      confidence: Number(result.confidence) || 0,
      source: result.source,
      matched_text: result.matched_text || null,
      matchedKeyword: result.matchedKeyword || undefined,
    });
  } catch (err) {
    console.error('Error in categorize controller:', err);
    return res.status(200).json({
      success: true,
      category: null,
      confidence: 0,
      source: null,
      matched_text: null
    });
  }
};

module.exports = {
  categorize,
};
