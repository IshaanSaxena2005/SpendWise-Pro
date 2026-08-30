const pool = require('../config/db');
const axios = require('axios');
const { getAnomalyHistory } = require('./anomalyService');
const { generateContent, hasGeminiApiKey, sanitizePromptText } = require('./geminiService');

// Intent keywords → handler mapping for fast deterministic responses.
// Each entry: { patterns: [regex, ...], handler: string }
const INTENT_PATTERNS = [
  {
    patterns: [/how\s+much\s+(did\s+)?i\s+spend|month.*spend|spend.*month|total\s+spend|kharch.*month/i],
    handler: 'getThisMonthSpending',
  },
  {
    patterns: [/top\s+(spending\s+)?categor|biggest.*categor|highest.*spend|sabse.*zyada|sabse.*jyada/i],
    handler: 'getTopSpendingCategory',
  },
  {
    patterns: [/categor.*attention|which.*categor|konsa.*categor|kaunsa.*categor/i],
    handler: 'getCategoryNeedingAttention',
  },
  {
    patterns: [/overspend|budget\s+exceed|budget.*cross|zyada.*kharch|jyada.*kharch/i],
    handler: 'checkOverspending',
  },
  {
    patterns: [/save\s+money|savings?\s+tip|kaise\s+bachau|kaise\s+bacha|how.*save/i],
    handler: 'getSavingsTips',
  },
  {
    patterns: [/predict|forecast|next\s+month.*expense|agla.*mahina|agle.*month/i],
    handler: 'predictNextMonthExpenses',
  },
  {
    patterns: [/financial\s+health|health\s+score|sehat|health.*score/i],
    handler: 'getFinancialHealthScore',
  },
  {
    patterns: [/budget\s+status|budget.*kitna|budget.*status|budget.*baki|budget.*bacha/i],
    handler: 'showBudgetStatus',
  },
  {
    patterns: [/compare.*month|this.*vs.*last|pichla.*mahina|last.*month.*compar/i],
    handler: 'compareThisVsLastMonth',
  },
  {
    patterns: [/my\s+name|naam\s+kya|mera\s+naam|who\s+am\s+i/i],
    handler: 'getProfileName',
  },
  {
    patterns: [/my\s+email|email\s+kya|mera\s+email/i],
    handler: 'getProfileEmail',
  },
  {
    patterns: [/my\s+role|role\s+kya|mera\s+role/i],
    handler: 'getProfileRole',
  },
  {
    patterns: [/when\s+did.*join|join.*date|kab\s+join|kab\s+banaya/i],
    handler: 'getProfileJoinDate',
  },
  {
    patterns: [/avatar|profile.*photo|dp|photo/i],
    handler: 'checkAvatar',
  },
  {
    patterns: [/unusual|anomal|suspicious|fraud|weird.*transact|ajeeb.*kharch/i],
    handler: 'getAnomalies',
  },
  {
    patterns: [/today.*date|date.*today|aaj.*date|kya\s+date|what.*date/i],
    handler: 'getTodayDate',
  },
  {
    patterns: [/current\s+month|kaunsa\s+month|konsa\s+month|which\s+month|what.*month/i],
    handler: 'getCurrentMonth',
  },
];

async function getThisMonthSpending(userId) {
  const [[currentMonth]] = await pool.query(
    `SELECT
      COALESCE(SUM(e.amount), 0) AS current_month_spending
    FROM expenses e
    JOIN categories c ON c.id = e.category_id
    WHERE e.user_id = ?
      AND c.name NOT IN ('Salary', 'Freelance')
      AND e.expense_date >= DATE_FORMAT(CURDATE(), '%Y-%m-01')
      AND e.expense_date < DATE_FORMAT(DATE_ADD(CURDATE(), INTERVAL 1 MONTH), '%Y-%m-01')`,
    [userId]
  );
  return `You have spent ₹${Number(currentMonth.current_month_spending).toFixed(2)} this month.`;
}

async function getTopSpendingCategory(userId) {
  const [rows] = await pool.query(
    `SELECT
      c.name AS category_name,
      COALESCE(SUM(e.amount), 0) AS total_amount
    FROM expenses e
    JOIN categories c ON c.id = e.category_id
    WHERE e.user_id = ?
      AND c.name NOT IN ('Salary', 'Freelance')
      AND e.expense_date >= DATE_FORMAT(CURDATE(), '%Y-%m-01')
      AND e.expense_date < DATE_FORMAT(DATE_ADD(CURDATE(), INTERVAL 1 MONTH), '%Y-%m-01')
    GROUP BY c.id, c.name
    ORDER BY total_amount DESC
    LIMIT 1`,
    [userId]
  );

  if (rows.length === 0) {
    return "You don't have any spending data yet.";
  }

  return `Your top spending category this month is **${rows[0].category_name}** with ₹${Number(rows[0].total_amount).toFixed(2)}.`;
}

async function getCategoryNeedingAttention(userId) {
  const [budgets] = await pool.query(
    `SELECT 
      c.name, 
      b.amount_limit, 
      COALESCE(SUM(e.amount), 0) AS spent
    FROM budgets b
    JOIN categories c ON b.category_id = c.id
    LEFT JOIN expenses e ON b.category_id = e.category_id 
      AND e.expense_date BETWEEN b.month AND LAST_DAY(b.month)
      AND e.user_id = ?
    WHERE b.user_id = ? 
      AND b.category_id IS NOT NULL
      AND b.month = DATE_FORMAT(CURDATE(), '%Y-%m-01')
    GROUP BY b.id
    ORDER BY (spent / b.amount_limit) DESC
    LIMIT 1`,
    [userId, userId]
  );

  const budget = budgets[0];
  return budget 
    ? `Your **${budget.name}** budget needs attention. You've spent ₹${Number(budget.spent).toFixed(2)} against a limit of ₹${Number(budget.amount_limit).toFixed(2)}.`
    : "No budget needs attention right now.";
}

async function checkOverspending(userId) {
  const [[currentMonth]] = await pool.query(
    `SELECT
      COALESCE(SUM(e.amount), 0) AS current_month_spending
    FROM expenses e
    JOIN categories c ON c.id = e.category_id
    WHERE e.user_id = ?
      AND c.name NOT IN ('Salary', 'Freelance')
      AND e.expense_date >= DATE_FORMAT(CURDATE(), '%Y-%m-01')
      AND e.expense_date < DATE_FORMAT(DATE_ADD(CURDATE(), INTERVAL 1 MONTH), '%Y-%m-01')`,
    [userId]
  );
  
  const [[budget]] = await pool.query(
    `SELECT amount_limit
    FROM budgets
    WHERE user_id = ?
      AND category_id IS NULL
      AND month = DATE_FORMAT(CURDATE(), '%Y-%m-01')
    LIMIT 1`,
    [userId]
  );

  const currentMonthSpending = Number(currentMonth.current_month_spending);
  const monthlyBudget = budget ? Number(budget.amount_limit) : null;

  if (monthlyBudget !== null) {
    const usage = currentMonthSpending / monthlyBudget;
    return usage > 1 
      ? `Yes, you are overspending. You've spent ₹${currentMonthSpending.toFixed(2)} against your total budget of ₹${monthlyBudget.toFixed(2)}.`
      : `No, you are not overspending. You've spent ₹${currentMonthSpending.toFixed(2)} against your total budget of ₹${monthlyBudget.toFixed(2)}.`;
  }
  return "You don't have a budget set up yet.";
}

async function getSavingsTips(userId) {
  const [recommendations] = await pool.query(
    'SELECT * FROM recommendations WHERE user_id = ? ORDER BY impact_score DESC LIMIT 3',
    [userId]
  );
  if (recommendations.length > 0) {
    const tips = recommendations.map((rec, index) => `${index + 1}. **${rec.title}**: ${rec.description}`).join('\n');
    return `Here are some savings tips:\n${tips}`;
  }
  return "Start tracking your expenses and set budgets to find savings opportunities!";
}

async function predictNextMonthExpenses(userId) {
  const [rows] = await pool.query(
    `SELECT DATE_FORMAT(expense_date, '%Y-%m') as month,
            SUM(amount) as total
     FROM expenses
     WHERE user_id = ?
     GROUP BY month
     ORDER BY month ASC`,
    [userId]
  );

  const history = rows.map(row => Number(row.total));

  if (history.length < 3) {
    return "Not enough historical data for prediction.";
  }

  const mlServiceUrl = process.env.ML_SERVICE_URL;
  if (!mlServiceUrl) {
    return "ML service is not configured.";
  }

  try {
    const flaskResponse = await axios.post(
      `${mlServiceUrl.replace(/\/$/, '')}/forecast`,
      { history: history }
    );

    const predicted = flaskResponse.data.predicted_spending;
    const trend = flaskResponse.data.trend_direction;
    return `Based on your spending history, I predict your expenses next month will be around ₹${Number(predicted).toFixed(2)}. The trend is ${trend.toLowerCase()}.`;
  } catch {
    return "Sorry, I couldn't generate a prediction right now.";
  }
}

async function getFinancialHealthScore(userId) {
  const [score] = await pool.query('SELECT score FROM financial_health WHERE user_id = ? ORDER BY created_at DESC LIMIT 1', [userId]);
  if (score.length > 0) {
    return `Your financial health score is **${score[0].score}** out of 100.`;
  }
  return "Generate your financial health insights to see your score!";
}

async function showBudgetStatus(userId) {
  const [budgets] = await pool.query(
    `SELECT
      c.name,
      b.amount_limit,
      COALESCE(SUM(e.amount), 0) AS spent
    FROM budgets b
    LEFT JOIN categories c ON b.category_id = c.id
    LEFT JOIN expenses e ON b.category_id = e.category_id 
      AND e.expense_date BETWEEN b.month AND LAST_DAY(b.month)
      AND e.user_id = ?
    WHERE b.user_id = ? 
      AND b.month = DATE_FORMAT(CURDATE(), '%Y-%m-01')
    GROUP BY b.id`,
    [userId, userId]
  );

  if (budgets.length > 0) {
    const status = budgets.map(b => `- **${b.name || 'Overall'}**: ₹${Number(b.spent).toFixed(2)} / ₹${Number(b.amount_limit).toFixed(2)}`).join('\n');
    return `Here is your budget status for this month:\n${status}`;
  }
  return "You don't have any budgets set up yet.";
}

async function compareThisVsLastMonth(userId) {
  const [[thisMonth]] = await pool.query(
    `SELECT
      COALESCE(SUM(e.amount), 0) AS total
    FROM expenses e
    JOIN categories c ON c.id = e.category_id
    WHERE e.user_id = ?
      AND c.name NOT IN ('Salary', 'Freelance')
      AND e.expense_date >= DATE_FORMAT(CURDATE(), '%Y-%m-01')
      AND e.expense_date < DATE_FORMAT(DATE_ADD(CURDATE(), INTERVAL 1 MONTH), '%Y-%m-01')`,
    [userId]
  );

  const [[lastMonth]] = await pool.query(
    `SELECT
      COALESCE(SUM(e.amount), 0) AS total
    FROM expenses e
    JOIN categories c ON c.id = e.category_id
    WHERE e.user_id = ?
      AND c.name NOT IN ('Salary', 'Freelance')
      AND e.expense_date >= DATE_FORMAT(DATE_SUB(CURDATE(), INTERVAL 1 MONTH), '%Y-%m-01')
      AND e.expense_date < DATE_FORMAT(CURDATE(), '%Y-%m-01')`,
    [userId]
  );

  const thisTotal = Number(thisMonth.total);
  const lastTotal = Number(lastMonth.total);
  const diff = thisTotal - lastTotal;
  return `This month: ₹${thisTotal.toFixed(2)}\nLast month: ₹${lastTotal.toFixed(2)}\nDifference: ${diff > 0 ? '+' : ''}₹${diff.toFixed(2)} (${diff > 0 ? 'increase' : 'decrease'})`;
}

async function getProfileName(userId) {
  const [user] = await pool.query('SELECT full_name FROM users WHERE id = ?', [userId]);
  return user.length > 0 ? `Your name is **${user[0].full_name}**.` : "User not found.";
}

async function getProfileEmail(userId) {
  const [user] = await pool.query('SELECT email FROM users WHERE id = ?', [userId]);
  return user.length > 0 ? `Your email is **${user[0].email}**.` : "User not found.";
}

async function getProfileRole(_userId) {
  return "Your role is **User**.";
}

async function getProfileJoinDate(userId) {
  const [user] = await pool.query('SELECT created_at FROM users WHERE id = ?', [userId]);
  return user.length > 0 ? `You joined on **${new Date(user[0].created_at).toLocaleDateString()}**.` : "User not found.";
}

async function checkAvatar(userId) {
  const [avatar] = await pool.query('SELECT * FROM profile_photos WHERE user_id = ?', [userId]);
  return avatar.length > 0 ? "Yes, you have an avatar set up." : "No, you don't have an avatar yet.";
}

async function getAnomalies(userId) {
  const anomalies = await getAnomalyHistory(userId);
  if (!anomalies || anomalies.length === 0) return "No unusual transactions were detected.";
  const lines = anomalies.slice(0, 3).map(anomaly => 
    `- ${anomaly.description} (${new Date(anomaly.created_at).toLocaleDateString()})`
  );
  return `Here are your recent unusual transactions:\n${lines.join('\n')}`;
}async function getTodayDate() {
  const now = new Date();
  const options = { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' };
  const dateStr = now.toLocaleDateString('en-IN', options);
  const timeStr = now.toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' });
  return `Aaj ki date **${dateStr}** hai aur time **${timeStr}** IST hai.`;
}

async function getCurrentMonth() {
  const now = new Date();
  const month = now.toLocaleDateString('en-IN', { month: 'long', year: 'numeric' });
  return `Current month is **${month}**.`;
}

async function buildFinancialContext(userId) {
  const now = new Date();
  const currentMonthStart = now.toISOString().slice(0, 7) + '-01';
  const nextMonth = new Date(now.getFullYear(), now.getMonth() + 1, 1);
  const lastMonth = new Date(now.getFullYear(), now.getMonth() - 1, 1);
  const lastMonthEnd = new Date(now.getFullYear(), now.getMonth(), 0);
  
  // User profile
  const [user] = await pool.query(
    'SELECT id, full_name, email, created_at FROM users WHERE id = ? LIMIT 1',
    [userId]
  );

  // This month spending
  const [[thisMonth]] = await pool.query(
    `SELECT COALESCE(SUM(e.amount), 0) AS total
     FROM expenses e
     JOIN categories c ON c.id = e.category_id
     WHERE e.user_id = ?
       AND c.name NOT IN ('Salary', 'Freelance')
       AND e.expense_date >= DATE_FORMAT(CURDATE(), '%Y-%m-01')
       AND e.expense_date < DATE_FORMAT(DATE_ADD(CURDATE(), INTERVAL 1 MONTH), '%Y-%m-01')`,
     [userId]
  );

  // Last month spending
  const [[lastMonthData]] = await pool.query(
    `SELECT COALESCE(SUM(e.amount), 0) AS total
     FROM expenses e
     JOIN categories c ON c.id = e.category_id
     WHERE e.user_id = ?
       AND c.name NOT IN ('Salary', 'Freelance')
       AND e.expense_date >= DATE_FORMAT(DATE_SUB(CURDATE(), INTERVAL 1 MONTH), '%Y-%m-01')
       AND e.expense_date < DATE_FORMAT(CURDATE(), '%Y-%m-01')`,
    [userId]
  );

  // This month income
  const [[thisMonthIncome]] = await pool.query(
    `SELECT COALESCE(SUM(e.amount), 0) AS total
     FROM expenses e
     WHERE e.user_id = ?
       AND e.transaction_type = 'income'
       AND e.expense_date >= DATE_FORMAT(CURDATE(), '%Y-%m-01')
       AND e.expense_date < DATE_FORMAT(DATE_ADD(CURDATE(), INTERVAL 1 MONTH), '%Y-%m-01')`,
    [userId]
  );

  // Top categories this month
  const [topCategories] = await pool.query(
    `SELECT c.name AS category_name, COALESCE(SUM(e.amount), 0) AS total_amount
     FROM expenses e
     JOIN categories c ON c.id = e.category_id
     WHERE e.user_id = ?
       AND c.name NOT IN ('Salary', 'Freelance')
       AND e.expense_date >= DATE_FORMAT(CURDATE(), '%Y-%m-01')
       AND e.expense_date < DATE_FORMAT(DATE_ADD(CURDATE(), INTERVAL 1 MONTH), '%Y-%m-01')
     GROUP BY c.id, c.name
     ORDER BY total_amount DESC
     LIMIT 5`,
    [userId]
  );

  // All categories this month with amounts
  const [allCategories] = await pool.query(
    `SELECT c.name AS category_name, COALESCE(SUM(e.amount), 0) AS total_amount
     FROM expenses e
     JOIN categories c ON c.id = e.category_id
     WHERE e.user_id = ?
       AND c.name NOT IN ('Salary', 'Freelance')
       AND e.expense_date >= DATE_FORMAT(CURDATE(), '%Y-%m-01')
       AND e.expense_date < DATE_FORMAT(DATE_ADD(CURDATE(), INTERVAL 1 MONTH), '%Y-%m-01')
     GROUP BY c.id, c.name
     ORDER BY total_amount DESC`,
    [userId]
  );

  // Budgets
  const [budgets] = await pool.query(
    `SELECT
      COALESCE(c.name, 'Overall') AS name,
      b.amount_limit,
      COALESCE(SUM(e.amount), 0) AS spent
     FROM budgets b
     LEFT JOIN categories c ON b.category_id = c.id
     LEFT JOIN expenses e ON b.category_id = e.category_id
       AND e.expense_date BETWEEN b.month AND LAST_DAY(b.month)
       AND e.user_id = ?
     WHERE b.user_id = ?
       AND b.month = DATE_FORMAT(CURDATE(), '%Y-%m-01')
     GROUP BY b.id
     LIMIT 8`,
    [userId, userId]
  );

  // Recent transactions (last 10)
  const [recentTransactions] = await pool.query(
    `SELECT e.title, e.amount, e.expense_date, c.name AS category_name, e.transaction_type
     FROM expenses e
     JOIN categories c ON c.id = e.category_id
     WHERE e.user_id = ?
     ORDER BY e.expense_date DESC
     LIMIT 10`,
    [userId]
  );

  // Recurring transactions
  const [recurringTransactions] = await pool.query(
    `SELECT rt.type, rt.amount, c.name AS category_name, rt.frequency, rt.note
     FROM recurring_transactions rt
     LEFT JOIN categories c ON rt.category_id = c.id
     WHERE rt.user_id = ? AND rt.is_active = 1
     LIMIT 10`,
    [userId]
  );

  // Goals
  const [goals] = await pool.query(
    `SELECT name, target_amount, saved_amount, target_date, priority
     FROM goals
     WHERE user_id = ? AND is_completed = 0
     LIMIT 5`,
    [userId]
  );

  // Health score
  const [health] = await pool.query(
    'SELECT score FROM financial_health WHERE user_id = ? ORDER BY created_at DESC LIMIT 1',
    [userId]
  );

  // Total transactions count
  const [[txCount]] = await pool.query(
    `SELECT COUNT(*) as count FROM expenses WHERE user_id = ?
     AND expense_date >= DATE_FORMAT(CURDATE(), '%Y-%m-01')
     AND expense_date < DATE_FORMAT(DATE_ADD(CURDATE(), INTERVAL 1 MONTH), '%Y-%m-01')`,
    [userId]
  );

  return {
    userFirstName: String(user[0]?.full_name || 'User').split(' ')[0],
    userFullName: user[0]?.full_name || 'User',
    today: now.toISOString().split('T')[0],
    currentMonth: now.toLocaleDateString('en-IN', { month: 'long', year: 'numeric' }),
    thisMonthSpending: Number(thisMonth.total) || 0,
    lastMonthSpending: Number(lastMonthData.total) || 0,
    thisMonthIncome: Number(thisMonthIncome.total) || 0,
    thisMonthSavings: (Number(thisMonthIncome.total) || 0) - (Number(thisMonth.total) || 0),
    transactionCount: Number(txCount.count) || 0,
    topCategories: topCategories.map((r) => ({
      category: r.category_name,
      amount: Number(r.total_amount) || 0,
    })),
    allCategories: allCategories.map((r) => ({
      category: r.category_name,
      amount: Number(r.total_amount) || 0,
    })),
    budgets: budgets.map((b) => ({
      name: b.name,
      limit: Number(b.amount_limit) || 0,
      spent: Number(b.spent) || 0,
      remaining: (Number(b.amount_limit) || 0) - (Number(b.spent) || 0),
      usagePercent: b.amount_limit > 0 ? Math.round((Number(b.spent) / Number(b.amount_limit)) * 100) : 0,
    })),
    recentTransactions: recentTransactions.map((t) => ({
      title: t.title,
      amount: Number(t.amount),
      date: t.expense_date,
      category: t.category_name,
      type: t.transaction_type,
    })),
    recurringTransactions: recurringTransactions.map((r) => ({
      type: r.type,
      amount: Number(r.amount),
      category: r.category_name,
      frequency: r.frequency,
      note: r.note,
    })),
    goals: goals.map((g) => ({
      name: g.name,
      target: Number(g.target_amount),
      saved: Number(g.saved_amount),
      targetDate: g.target_date,
      priority: g.priority,
    })),
    healthScore: health[0] ? Number(health[0].score) : null,
  };
}

async function callGeminiChat(userId, userQuery, conversationHistory = []) {
  if (!hasGeminiApiKey()) {
    return { ok: false, reason: 'missing_api_key', response: null, durationMs: 0 };
  }

  let context;
  try {
    context = await buildFinancialContext(userId);
  } catch (err) {
    console.warn('[AI Chat] context build failed:', err.message);
    context = null;
  }

  const safeQuery = sanitizePromptText(userQuery, 500);

  // Build conversation history context for multi-turn support
  let historyBlock = '';
  if (conversationHistory.length > 0) {
    const recentHistory = conversationHistory.slice(-6); // last 6 messages for context
    historyBlock = '\n\nConversation history (for context):\n' +
      recentHistory.map(m => `${m.role === 'user' ? 'User' : 'Assistant'}: ${m.content}`).join('\n');
  }

  const prompt = `You are SpendWise AI — an intelligent, friendly personal finance assistant built for Indian users.
You handle BOTH financial questions AND general conversation naturally.

## YOUR CAPABILITIES
1. **Financial Analysis**: Use the user's real SpendWise data (spending, budgets, goals, transactions) to answer finance questions with specific numbers.
2. **General Conversation**: Answer any question naturally — general knowledge, explanations, jokes, math, comparisons, current topics.
3. **Hinglish**: Understand and respond naturally in English, Hindi, or Hinglish. Match the user's language and tone.
4. **Context Awareness**: Use the conversation history to understand follow-up questions and references like "it", "that", "how much more".

## RULES
- When answering finance questions, ALWAYS use the provided financial context data. Never invent numbers.
- When the user asks something unrelated to finance, answer it naturally and helpfully.
- If you don't have enough data to answer a finance question, say so honestly and provide general guidance.
- Keep responses concise (max 150 words) but complete.
- Use ₹ and Indian number formatting for money.
- Be warm, friendly, and conversational — not robotic.
- Use Markdown formatting for readability (bold, lists).
- NEVER reveal passwords, tokens, or sensitive account details.
- NEVER invent financial data that isn't in the context.
- For time-sensitive questions (news, live scores, weather), honestly say you don't have real-time access.

Return ONLY valid JSON:
{"answer":"<your helpful reply>","confidence":<integer 0-100>,"category":"finance|general|hinglish"}

User's financial context (JSON):
${JSON.stringify(context || {})}${historyBlock}

User's question:
${safeQuery}`;

  // Don't cache conversational/general queries — only finance data queries
  const isLikelyFinanceQuery = /spend|budget|save|money|income|expense|category|transaction|goal|recurring|salary|kharch|bachat|budget/i.test(safeQuery);
  const cacheKey = isLikelyFinanceQuery ? `chat:${userId}:${safeQuery.toLowerCase()}` : null;

  const gemini = await generateContent({
    prompt,
    temperature: 0.4,
    maxOutputTokens: 600,
    responseMimeType: 'application/json',
    cacheKey,
  });

  if (!gemini.ok) {
    return { ok: false, reason: gemini.reason || 'api_failure', response: null, durationMs: gemini.durationMs };
  }

  const answer = gemini.json?.answer || gemini.text;
  if (!answer || !String(answer).trim()) {
    return { ok: false, reason: 'empty_response', response: null, durationMs: gemini.durationMs };
  }

  return {
    ok: true,
    reason: null,
    response: String(answer).trim(),
    durationMs: gemini.durationMs,
    confidence: Number(gemini.json?.confidence) || null,
  };
}

async function handleRuleBasedChat(userId, userQuery) {
  const trimmedQuery = userQuery.trim();
  let matchedHandler = null;

  // Use flexible regex pattern matching instead of exact string match
  for (const intent of INTENT_PATTERNS) {
    for (const pattern of intent.patterns) {
      if (pattern.test(trimmedQuery)) {
        matchedHandler = intent.handler;
        break;
      }
    }
    if (matchedHandler) break;
  }

  if (!matchedHandler) {
    return null;
  }

  const handlers = {
    getThisMonthSpending,
    getTopSpendingCategory,
    getCategoryNeedingAttention,
    checkOverspending,
    getSavingsTips,
    predictNextMonthExpenses,
    getFinancialHealthScore,
    showBudgetStatus,
    compareThisVsLastMonth,
    getProfileName,
    getProfileEmail,
    getProfileRole,
    getProfileJoinDate,
    checkAvatar,
    getAnomalies,
    getTodayDate,
    getCurrentMonth,
  };
  return await handlers[matchedHandler](userId);
}

async function handleAIChat(userId, userQuery, conversationHistory = []) {
  const started = Date.now();
  const safeQuery = sanitizePromptText(userQuery, 500);
  if (!safeQuery) {
    return "Please ask a question — I'm here to help with finances or anything else!";
  }

  // Prefer rule handlers for deterministic data queries (fast + reliable)
  const ruleAnswer = await handleRuleBasedChat(userId, safeQuery);
  if (ruleAnswer) {
    console.log('[AI Chat]', {
      source: 'rule_engine',
      durationMs: Date.now() - started,
      geminiConfigured: hasGeminiApiKey(),
    });
    return ruleAnswer;
  }

  // Gemini for everything else: finance analysis, general Q&A, Hinglish, follow-ups
  const gemini = await callGeminiChat(userId, safeQuery, conversationHistory);
  if (gemini.ok && gemini.response) {
    console.log('[AI Chat]', {
      source: 'gemini',
      category: gemini.category || 'unknown',
      confidence: gemini.confidence,
      durationMs: gemini.durationMs,
      geminiConfigured: true,
    });
    return gemini.response;
  }

  console.log('[AI Chat]', {
    source: 'fallback',
    fallbackReason: gemini.reason || 'unknown',
    durationMs: Date.now() - started,
    geminiConfigured: hasGeminiApiKey(),
  });

  // Smart fallback based on the query type
  const lowerQuery = safeQuery.toLowerCase();
  if (/joke|funny|mazaak|mazak/i.test(lowerQuery)) {
    return "Here's one: Why did the rupee break up with the dollar? Because it found a better exchange! 😄\n\nBut seriously, I'm SpendWise AI — ask me about your finances, budgets, or anything you'd like help with!";
  }
  if (/thank|shukriya|dhanyavaad/i.test(lowerQuery)) {
    return "You're welcome! 😊 I'm always here to help. Feel free to ask anything — whether it's about your spending, savings tips, or just a friendly chat!";
  }
  if (/hello|hi|hey|namaste|namaskar|haeloo/i.test(lowerQuery)) {
    return "Hey there! 👋 Welcome to SpendWise AI. I can help you with:\n\n- 💰 **Spending analysis** — where your money goes\n- 📊 **Budget tracking** — how you're doing against limits\n- 💡 **Savings tips** — how to save more\n- 🧠 **General questions** — anything you're curious about\n\nWhat would you like to know?";
  }
  return "I'm SpendWise AI — your personal finance assistant! 🤖\n\nI can help with:\n- 💰 Your spending, budgets, and savings\n- 📊 Financial analysis and predictions\n- 🧠 General knowledge and questions\n\nTry asking something like:\n- \"How much did I spend this month?\"\n- \"Where am I overspending?\"\n- \"How can I save ₹5,000 next month?\"\n- \"What is compound interest?\"";
}

module.exports = {
  handleAIChat,
  INTENT_PATTERNS,
};
