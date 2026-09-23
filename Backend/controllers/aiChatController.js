const { handleAIChat } = require('../services/aiChatService');

const chat = async (req, res) => {
  try {
    // Always derive user ID from authenticated JWT — never trust frontend user_id
    const userId = req.user.id;
    const { query, conversationHistory } = req.body;
    
    if (!query) {
      return res.status(400).json({ success: false, message: 'Query is required.' });
    }

    // Validate and sanitize conversation history (bounded: last 6 messages,
    // 500 chars each) — user-scoped context only lives in the request.
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
    // Log the technical detail server-side; return a generic message so no
    // internals (stack, SQL, Gemini errors) ever reach the client.
    console.error('[AI Chat] chat handler failed:', err.message);
    res.status(500).json({ success: false, message: 'Something went wrong. Please try again in a moment.' });
  }
};

module.exports = {
  chat,
};
