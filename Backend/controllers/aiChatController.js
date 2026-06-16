const { handleAIChat } = require('../services/aiChatService');

const chat = async (req, res) => {
  try {
    const userId = req.user.id;
    const { query } = req.body;
    
    if (!query) {
      return res.status(400).json({ success: false, message: 'Query is required.' });
    }
    
    const response = await handleAIChat(userId, query);
    res.json({ success: true, response });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};

module.exports = {
  chat,
};
