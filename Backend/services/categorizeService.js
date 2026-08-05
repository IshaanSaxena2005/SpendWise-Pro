const axios = require('axios');
const pool = require('../config/db');
const { CATEGORY_KEYWORDS, CATEGORY_ALIASES } = require('../constants/categoryKeywords');
const { normalizeMerchant } = require('./learningService');

// In-memory cache for category name embeddings
const categoryEmbeddingCache = new Map();

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

async function getGeminiEmbedding(text) {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) return null;

  // Check cache first
  if (categoryEmbeddingCache.has(text)) {
    return categoryEmbeddingCache.get(text);
  }

  try {
    const endpoint = `https://generativelanguage.googleapis.com/v1beta/models/text-embedding-004:embedContent?key=${apiKey}`;
    const response = await axios.post(
      endpoint,
      {
        model: 'models/text-embedding-004',
        content: {
          parts: [{ text }]
        }
      },
      { timeout: 5000 }
    );
    const vector = response.data?.embedding?.values || null;
    if (vector) {
      categoryEmbeddingCache.set(text, vector);
    }
    return vector;
  } catch (err) {
    console.warn(`Failed to get embedding for: "${text}":`, err.message);
    return null;
  }
}

function cosineSimilarity(vecA, vecB) {
  let dotProduct = 0.0;
  let normA = 0.0;
  let normB = 0.0;
  for (let i = 0; i < vecA.length; i++) {
    dotProduct += vecA[i] * vecB[i];
    normA += vecA[i] * vecA[i];
    normB += vecB[i] * vecB[i];
  }
  if (normA === 0 || normB === 0) return 0;
  return dotProduct / (Math.sqrt(normA) * Math.sqrt(normB));
}

async function categorizeTransaction(userId, description) {
  if (!description || !String(description).trim()) {
    return {
      category: null,
      confidence: 0,
      source: null,
      matched_text: null
    };
  }

  const normalized = normalizeMerchant(description);

  // 1. User Learning Database Lookup (Exact)
  if (userId) {
    try {
      const [learned] = await pool.query(
        `SELECT ucl.confidence, c.name AS category_name, ucl.merchant 
         FROM user_category_learning ucl
         JOIN categories c ON c.id = ucl.category_id
         WHERE ucl.user_id = ? AND ucl.normalized_merchant = ?`,
        [userId, normalized]
      );
      if (learned.length > 0) {
        return {
          category: learned[0].category_name,
          confidence: Math.round(Number(learned[0].confidence)),
          source: 'learning',
          matched_text: learned[0].merchant
        };
      }
    } catch (err) {
      console.error('Error fetching exact user category learning:', err);
    }
  }

  // 2. Global Merchant Alias Lookup
  try {
    const [aliasMatch] = await pool.query(
      `SELECT category_name, alias FROM merchant_aliases WHERE alias = ? OR merchant = ? LIMIT 1`,
      [normalized, normalized]
    );
    if (aliasMatch.length > 0) {
      return {
        category: aliasMatch[0].category_name,
        confidence: 95,
        source: 'learning',
        matched_text: aliasMatch[0].alias
      };
    }
  } catch (err) {
    console.error('Error fetching merchant aliases:', err);
  }

  // 3. Similar Merchant Learning Lookup (Substring / Fuzzy generalization)
  if (userId) {
    try {
      const [allLearned] = await pool.query(
        `SELECT ucl.confidence, c.name AS category_name, ucl.merchant, ucl.normalized_merchant 
         FROM user_category_learning ucl
         JOIN categories c ON c.id = ucl.category_id
         WHERE ucl.user_id = ?`,
        [userId]
      );
      let bestSimilarity = 0;
      let matchedRow = null;

      for (const row of allLearned) {
        // If one is substring of another
        if (normalized.includes(row.normalized_merchant) || row.normalized_merchant.includes(normalized)) {
          const sim = fuzzySimilarity(normalized, row.normalized_merchant);
          if (sim > bestSimilarity && sim >= 0.70) {
            bestSimilarity = sim;
            matchedRow = row;
          }
        }
      }

      if (matchedRow) {
        // Generalization from similar merchant (confidence starts high but slightly degraded to 90)
        return {
          category: matchedRow.category_name,
          confidence: Math.min(95, Math.round(Number(matchedRow.confidence) * 0.95)),
          source: 'learning',
          matched_text: matchedRow.merchant
        };
      }
    } catch (err) {
      console.error('Error fetching similar user category learning:', err);
    }
  }

  // 4. Local Keyword/Rule Based Matching
  const ruleResult = ruleBasedCategorize(description);
  if (ruleResult.confidence >= 70) {
    // Standardize confidence to 75-90 for keyword
    const adjustedConfidence = Math.round(75 + (ruleResult.confidence - 70) * (15 / 30));
    return {
      category: ruleResult.category,
      confidence: adjustedConfidence,
      source: 'keyword',
      matched_text: ruleResult.matchedKeyword || description
    };
  }

  // 5. Semantic Embedding Similarity (Phase 3)
  const apiKey = process.env.GEMINI_API_KEY;
  if (apiKey) {
    try {
      const inputVector = await getGeminiEmbedding(normalized);
      if (inputVector) {
        const standardCategories = Object.keys(CATEGORY_KEYWORDS);
        let maxSimilarity = -1;
        let bestCategory = null;

        for (const catName of standardCategories) {
          const catVector = await getGeminiEmbedding(catName.toLowerCase());
          if (catVector) {
            const sim = cosineSimilarity(inputVector, catVector);
            if (sim > maxSimilarity) {
              maxSimilarity = sim;
              bestCategory = catName;
            }
          }
        }

        // Cosine similarity threshold >= 0.55
        if (bestCategory && maxSimilarity >= 0.55) {
          // Scale confidence to 80-95
          const confidence = Math.round(80 + (maxSimilarity - 0.55) * (15 / 0.45));
          return {
            category: bestCategory,
            confidence: Math.min(95, confidence),
            source: 'embedding',
            matched_text: bestCategory
          };
        }
      }
    } catch (err) {
      console.warn('Semantic embedding similarity failed:', err.message || err);
    }

    // 6. AI Generation Fallback (Phase 6)
    const aiResult = await callGeminiCategorize(description);
    if (aiResult && aiResult.category) {
      return {
        category: aiResult.category,
        confidence: aiResult.confidence,
        source: 'ai',
        matched_text: description
      };
    }
  }

  // Final fallback using local rule if anything
  if (ruleResult.category) {
    return {
      category: ruleResult.category,
      confidence: ruleResult.confidence,
      source: 'keyword',
      matched_text: ruleResult.matchedKeyword || description
    };
  }

  return {
    category: null,
    confidence: 0,
    source: null,
    matched_text: null
  };
}

module.exports = {
  categorizeTransaction,
  ruleBasedCategorize,
  levenshteinDistance,
  fuzzySimilarity,
};
