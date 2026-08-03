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
      });
    }

    const result = await categorizeTransaction(description);

    return res.status(200).json({
      success: true,
      category: result.category,
      confidence: Number(result.confidence) || 0,
      source: result.source,
      matchedKeyword: result.matchedKeyword || undefined,
    });
  } catch (err) {
    console.error('Error in categorize controller:', err);
    return res.status(200).json({
      success: true,
      category: null,
      confidence: 0,
      source: null,
    });
  }
};

module.exports = {
  categorize,
};
