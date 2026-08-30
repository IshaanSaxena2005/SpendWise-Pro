const { handleAIChat } = require('../services/aiChatService');

const chat = async (req, res) => {
  try {
    // Always derive user ID from authenticated JWT — never trust frontend user_id
    const userId = req.user.id;
    const { query, conversationHistory } = req.body;
    
    if (!query) {
      return res.status(400).json({ success: false, message: 'Query is required.' });
    }

    // Validate and sanitize conversation history (max 6 messages for context)
    let history = [];
    if (Array.isArray(conversationHistory) && conversationHistory.length > 0) {
      history = conversationHistory
        .filter(m => m && typeof m.role === 'string' && typeof m.content === 'string')
        .slice(-6)
        .map(m => ({
          role: m.role === 'user' ? 'user' : 'ai',
          content: String(m.content).slice(0, 500),
        }));
    }
    
    const response = await handleAIChat(userId, query, history);
    res.json({ success: true, response });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};

module.exports = {
  chat,
};
