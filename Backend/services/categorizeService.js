const axios = require('axios');
const { CATEGORY_KEYWORDS, CATEGORY_ALIASES } = require('../constants/categoryKeywords');

function levenshteinDistance(a, b) {
  const matrix = [];
  for (let i = 0; i <= b.length; i++) {
    matrix[i] = [i];
  }
  for (let j = 0; j <= a.length; j++) {
    matrix[0][j] = j;
  }
  for (let i = 1; i <= b.length; i++) {
    for (let j = 1; j <= a.length; j++) {
      if (b.charAt(i - 1) === a.charAt(j - 1)) {
        matrix[i][j] = matrix[i - 1][j - 1];
      } else {
        matrix[i][j] = Math.min(
          matrix[i - 1][j - 1] + 1,
          matrix[i][j - 1] + 1,
          matrix[i - 1][j] + 1,
        );
      }
    }
  }
  return matrix[b.length][a.length];
}

function fuzzySimilarity(a, b) {
  const cleanA = String(a || '').trim().toLowerCase();
  const cleanB = String(b || '').trim().toLowerCase();
  if (cleanA === cleanB) return 1;
  if (cleanA.length === 0 || cleanB.length === 0) return 0;
  const distance = levenshteinDistance(cleanA, cleanB);
  const maxLen = Math.max(cleanA.length, cleanB.length);
  return 1 - distance / maxLen;
}

function normalizeDescription(description) {
  return String(description || '').trim().toLowerCase();
}

function findKeywordMatches(description) {
  const normalizedDesc = normalizeDescription(description);
  if (!normalizedDesc) return [];

  const descWords = normalizedDesc.split(/\s+/).filter(Boolean);
  const matches = [];

  for (const [categoryName, keywords] of Object.entries(CATEGORY_KEYWORDS)) {
    for (const keyword of keywords) {
      const normKeyword = keyword.toLowerCase();

      if (normalizedDesc.includes(normKeyword)) {
        let score = 0;
        if (descWords.includes(normKeyword)) {
          score = 0.98;
        } else if (descWords.some((w) => w === normKeyword || normKeyword === w)) {
          score = 0.97;
        } else {
          const overlapRatio = normKeyword.length / normalizedDesc.length;
          score = 0.9 + overlapRatio * 0.05;
        }
        matches.push({ categoryName, keyword, score, isFuzzy: false });
        continue;
      }

      for (const word of descWords) {
        if (word.length < 3) continue;
        const sim = fuzzySimilarity(word, normKeyword);
        if (sim >= 0.72) {
          let adjustedScore = 0.5 + sim * 0.35;
          if (sim >= 0.85) adjustedScore = Math.min(0.84, adjustedScore + 0.05);
          if (sim >= 0.95) adjustedScore = Math.min(0.88, adjustedScore + 0.02);

          const existing = matches.find(
            (m) => m.categoryName === categoryName && m.keyword === keyword,
          );
          if (!existing || adjustedScore > existing.score) {
            matches.push({
              categoryName,
              keyword,
              score: adjustedScore,
              isFuzzy: true,
            });
          }
        }
      }
    }
  }

  matches.sort((a, b) => b.score - a.score);
  return matches;
}

function ruleBasedCategorize(description) {
  const desc = normalizeDescription(description);
  if (!desc) {
    return { category: null, confidence: 0, source: 'rule' };
  }

  const matches = findKeywordMatches(desc);
  if (matches.length === 0) {
    return { category: null, confidence: 0, source: 'rule' };
  }

  const best = matches[0];
  return {
    category: best.categoryName,
    confidence: Math.round(best.score * 100),
    source: best.isFuzzy ? 'fuzzy' : 'keyword',
    matchedKeyword: best.keyword,
  };
}

async function callGeminiCategorize(description) {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    return null;
  }

  const categoryList = Object.keys(CATEGORY_KEYWORDS).join(', ');

  const prompt = `You are a transaction categorization expert.
Given the transaction description below, classify it into EXACTLY ONE of these categories: ${categoryList}.

IMPORTANT RULES:
- Return ONLY valid JSON with fields: "category" (string), "confidence" (integer 0-100)
- The "category" MUST be one of: ${categoryList}
- Do NOT invent new categories
- If unsure, pick the most likely category with a lower confidence
- Be accurate with typos and partial matches

Transaction description: ${description}

Return only the JSON, no extra text.`;

  try {
    const endpoint = `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash-latest:generateContent?key=${apiKey}`;

    const response = await axios.post(
      endpoint,
      {
        contents: [
          {
            parts: [{ text: prompt }],
          },
        ],
        generationConfig: {
          temperature: 0.1,
          maxOutputTokens: 100,
        },
      },
      {
        timeout: 8000,
        headers: {
          'Content-Type': 'application/json',
        },
      },
    );

    const rawText =
      response?.data?.candidates?.[0]?.content?.parts?.[0]?.text || '';

    const jsonMatch = rawText.match(/\{[\s\S]*\}/);
    if (!jsonMatch) {
      return null;
    }

    const parsed = JSON.parse(jsonMatch[0]);
    const category = String(parsed.category || '').trim();
    const confidence = Number(parsed.confidence);

    const validCategories = Object.keys(CATEGORY_KEYWORDS);
    let matchedCategory = validCategories.find(
      (c) => c.toLowerCase() === category.toLowerCase(),
    );

    if (!matchedCategory) {
      for (const validCat of validCategories) {
        const aliases = CATEGORY_ALIASES[validCat] || [];
        const aliasMatch = aliases.find(
          (a) => a.toLowerCase() === category.toLowerCase(),
        );
        if (aliasMatch) {
          matchedCategory = validCat;
          break;
        }
      }
    }

    if (!matchedCategory) {
      let bestSim = 0;
      for (const validCat of validCategories) {
        const sim = fuzzySimilarity(validCat, category);
        if (sim > bestSim && sim >= 0.6) {
          bestSim = sim;
          matchedCategory = validCat;
        }
      }
    }

    if (!matchedCategory) {
      return null;
    }

    const finalConfidence = Number.isFinite(confidence)
      ? Math.max(0, Math.min(100, Math.round(confidence)))
      : 70;

    return {
      category: matchedCategory,
      confidence: finalConfidence,
      source: 'ai',
    };
  } catch (err) {
    console.warn('Gemini categorize failed:', err.message || err);
    return null;
  }
}

async function categorizeTransaction(description) {
  if (!description || !String(description).trim()) {
    return {
      category: null,
      confidence: 0,
      source: null,
    };
  }

  const ruleResult = ruleBasedCategorize(description);

  if (ruleResult.confidence >= 70) {
    return {
      category: ruleResult.category,
      confidence: ruleResult.confidence,
      source: ruleResult.source,
      matchedKeyword: ruleResult.matchedKeyword || undefined,
    };
  }

  const aiResult = await callGeminiCategorize(description);

  if (aiResult && aiResult.category) {
    return aiResult;
  }

  if (ruleResult.category) {
    return {
      category: ruleResult.category,
      confidence: ruleResult.confidence,
      source: ruleResult.source,
      matchedKeyword: ruleResult.matchedKeyword || undefined,
    };
  }

  return {
    category: null,
    confidence: 0,
    source: null,
  };
}

module.exports = {
  categorizeTransaction,
  ruleBasedCategorize,
  levenshteinDistance,
  fuzzySimilarity,
};
