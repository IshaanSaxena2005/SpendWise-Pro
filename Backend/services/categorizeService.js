const pool = require('../config/db');
const { CATEGORY_KEYWORDS, CATEGORY_ALIASES } = require('../constants/categoryKeywords');
const { normalizeMerchant } = require('./learningService');
const { generateContent, getEmbedding, hasGeminiApiKey } = require('./geminiService');

let axios = null;
try {
  axios = require('axios');
} catch (_err) {
  axios = null;
}

// ---------------------------------------------------------------------------
// Keyword vs ML arbitration
// ---------------------------------------------------------------------------
// Raw keyword scores (findKeywordMatches) are NOT calibrated probabilities:
//   - exact substring match  : 0.90–0.98 (inflated by design, keyword length ratio)
//   - fuzzy (typo) match     : 0.752–0.88 (0.5 + similarity * 0.35)
// ML probabilities (TF-IDF + LogReg predict_proba) ARE calibrated: ~0.3–0.97.
// Comparing them directly made keyword matching win ~always. Instead we compare
// weighted ARBITRATION scores and keep raw confidence purely as diagnostics.
//
// Weights: ML 1.0 (calibrated). Keyword 0.7 (heuristic) + 0.25 bonus only for
// near-certain EXACT matches (score >= KEYWORD_STRONG_MATCH, i.e. a full word
// from the description hit a known keyword at 0.95+). Weighted bands:
//   strong exact keyword  -> up to ~0.86  |  other exact keyword -> ~0.63–0.69
//   fuzzy keyword         -> ~0.53–0.59   |  ML probability      -> 0.55–0.97
// so a genuinely confident ML prediction beats non-exceptional keyword matches,
// while an exact "swiggy"-style merchant hit stays trusted.
const KEYWORD_STRONG_MATCH = 95; // raw keyword score >= this is treated as deterministic
const KEYWORD_WEAK_MATCH = 55; // raw keyword score below this -> keyword layer declines
const ML_MIN_CONFIDENCE = 55; // raw ML probability (%) below this -> ML layer declines
const ML_WEIGHT = 1.0;
const KEYWORD_WEIGHT = 0.7;
const EXACT_KEYWORD_BONUS = 0.25;

function arbitrateKeywordVsMl(ruleResult, ml) {
  const kwRawPct = (ruleResult && ruleResult.rawScore != null) ? ruleResult.rawScore * 100 : null;
  const mlPct = (ml && ml.result && ml.result.category) ? ml.result.confidence : null;

  const kwEligible = kwRawPct != null && kwRawPct >= KEYWORD_WEAK_MATCH;
  const mlEligible = mlPct != null && mlPct >= ML_MIN_CONFIDENCE;

  if (kwEligible && mlEligible) {
    const isExact = ruleResult.source === 'keyword'; // findKeywordMatches: 'keyword'=exact, 'fuzzy'=typo-level
    const kwArb = (kwRawPct / 100) * KEYWORD_WEIGHT + (isExact && kwRawPct >= KEYWORD_STRONG_MATCH ? EXACT_KEYWORD_BONUS : 0);
    const mlArb = (mlPct / 100) * ML_WEIGHT;
    const winner = mlArb >= kwArb ? ml : { fromRule: true };
    return {
      winner,
      diagnostics: {
        keyword_raw_score: Math.round(kwRawPct),
        ml_raw_probability: mlPct,
        keyword_arbitration_score: Math.round(kwArb * 100),
        ml_arbitration_score: Math.round(mlArb * 100),
      },
    };
  }

  if (mlEligible) return { winner: ml, diagnostics: { keyword_raw_score: kwRawPct, ml_raw_probability: mlPct } };
  if (kwEligible) return { winner: { fromRule: true }, diagnostics: { keyword_raw_score: Math.round(kwRawPct), ml_raw_probability: mlPct } };
  return { winner: null, diagnostics: { keyword_raw_score: kwRawPct, ml_raw_probability: mlPct } };
}

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
    rawScore: best.score,
    source: best.isFuzzy ? 'fuzzy' : 'keyword',
    matchedKeyword: best.keyword,
  };
}

function resolveValidCategory(category) {
  const validCategories = Object.keys(CATEGORY_KEYWORDS);
  let matchedCategory = validCategories.find(
    (c) => c.toLowerCase() === String(category || '').trim().toLowerCase(),
  );

  if (!matchedCategory) {
    for (const validCat of validCategories) {
      const aliases = CATEGORY_ALIASES[validCat] || [];
      const aliasMatch = aliases.find(
        (a) => a.toLowerCase() === String(category || '').trim().toLowerCase(),
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

  return matchedCategory || null;
}

async function callGeminiCategorize(description) {
  if (!hasGeminiApiKey()) {
    return { result: null, reason: 'missing_api_key', durationMs: 0 };
  }

  const categoryList = Object.keys(CATEGORY_KEYWORDS).join(', ');
  const prompt = `You are a transaction categorization expert for SpendWise Pro.
Classify the transaction description into EXACTLY ONE category from this list: ${categoryList}.

Return ONLY valid JSON:
{"category":"<one of the listed categories>","confidence":<integer 0-100>,"explanation":"<short reason>"}

Rules:
- category MUST be one of: ${categoryList}
- Do NOT invent categories
- Prefer lower confidence when unsure
- Handle typos and merchant names

Transaction description: ${description}`;

  const gemini = await generateContent({
    prompt,
    temperature: 0.1,
    maxOutputTokens: 160,
    responseMimeType: 'application/json',
    cacheKey: `categorize:${normalizeDescription(description)}`,
  });

  if (!gemini.ok || !gemini.json) {
    return { result: null, reason: gemini.reason || 'invalid_json', durationMs: gemini.durationMs };
  }

  const matchedCategory = resolveValidCategory(gemini.json.category);
  if (!matchedCategory) {
    return { result: null, reason: 'invalid_category', durationMs: gemini.durationMs };
  }

  const confidence = Number(gemini.json.confidence);
  const finalConfidence = Number.isFinite(confidence)
    ? Math.max(0, Math.min(100, Math.round(confidence)))
    : 70;

  return {
    result: {
      category: matchedCategory,
      confidence: finalConfidence,
      source: 'ai',
      explanation: String(gemini.json.explanation || '').slice(0, 200) || null,
    },
    reason: null,
    durationMs: gemini.durationMs,
  };
}

async function getGeminiEmbedding(text) {
  const embed = await getEmbedding(text);
  return embed.ok ? embed.vector : null;
}

function logCategorize({ description, category, source, confidence, durationMs, fallbackReason }) {
  console.log('[Categorize]', {
    description: String(description || '').slice(0, 80),
    category: category || null,
    source,
    confidence,
    durationMs,
    fallbackReason: fallbackReason || null,
    geminiConfigured: hasGeminiApiKey(),
  });
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

async function callMlCategorize(description) {
  const mlServiceUrl = process.env.ML_SERVICE_URL;
  if (!mlServiceUrl || !axios) {
    return { result: null, reason: !mlServiceUrl ? 'ml_service_not_configured' : 'axios_missing', durationMs: 0 };
  }
  const started = Date.now();
  try {
    const headers = { 'Content-Type': 'application/json' };
    // Shared secret for the ML service (matches ML-Service/app.py x-ml-api-key check).
    if (process.env.ML_API_KEY) {
      headers['x-ml-api-key'] = process.env.ML_API_KEY;
    }
    const resp = await axios({
      method: 'POST',
      url: `${mlServiceUrl}/categorize`,
      data: { description },
      headers,
      timeout: 4000,
      responseType: 'json',
    });
    const body = resp && resp.data ? resp.data : {};
    const rawCategory = body.category;
    const rawConf = Number(body.confidence);
    const matchedCategory = resolveValidCategory(rawCategory);
    if (!matchedCategory) {
      return { result: null, reason: 'invalid_ml_category', durationMs: Date.now() - started };
    }
    const confFrac = Number.isFinite(rawConf) ? Math.max(0, Math.min(1, rawConf)) : 0;
    const confidencePct = Math.round(confFrac * 100);
    return {
      result: {
        category: matchedCategory,
        confidence: confidencePct,
        source: 'ml',
      },
      reason: null,
      durationMs: Date.now() - started,
    };
  } catch (err) {
    return {
      result: null,
      reason: `ml_error_${err && err.code ? err.code : 'generic'}`,
      durationMs: Date.now() - started,
    };
  }
}

async function categorizeTransaction(userId, description) {
  const started = Date.now();

  const finish = (payload, fallbackReason = null) => {
    logCategorize({
      description,
      category: payload.category,
      source: payload.source,
      confidence: payload.confidence,
      durationMs: Date.now() - started,
      fallbackReason,
    });
    return payload;
  };

  if (!description || !String(description).trim()) {
    return finish({
      category: null,
      confidence: 0,
      source: null,
      matched_text: null,
    }, 'empty_description');
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
        return finish({
          category: learned[0].category_name,
          confidence: Math.round(Number(learned[0].confidence)),
          source: 'learning',
          matched_text: learned[0].merchant
        });
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
      return finish({
        category: aliasMatch[0].category_name,
        confidence: 95,
        source: 'learning',
        matched_text: aliasMatch[0].alias
      });
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
        if (normalized.includes(row.normalized_merchant) || row.normalized_merchant.includes(normalized)) {
          const sim = fuzzySimilarity(normalized, row.normalized_merchant);
          if (sim > bestSimilarity && sim >= 0.70) {
            bestSimilarity = sim;
            matchedRow = row;
          }
        }
      }

      if (matchedRow) {
        return finish({
          category: matchedRow.category_name,
          confidence: Math.min(95, Math.round(Number(matchedRow.confidence) * 0.95)),
          source: 'learning',
          matched_text: matchedRow.merchant
        });
      }
    } catch (err) {
      console.error('Error fetching similar user category learning:', err);
    }
  }

  // ---------------------------------------------------------------------------
  // 4–5. Keyword vs ML arbitration
  //
  // Keyword rules no longer return early on a bare threshold: for normal
  // transactions the keyword layer and the ML layer COMPETE (see
  // arbitrateKeywordVsMl above). Strong deterministic matches (exact merchant
  // word at raw score >= KEYWORD_STRONG_MATCH) skip ML entirely — calling the
  // model to second-guess "swiggy" would be waste, not safety.
  //
  // Sources and user-facing confidence are unchanged in shape (0–100 integers):
  //   keyword win -> source 'keyword', user confidence = raw keyword score %
  //                  (exact 90–98, fuzzy 75–88) — no inflation remap
  //   ML win      -> source 'ml',      user confidence = calibrated probability %
  // User learning / aliases / strong fuzzy learning returned earlier and are
  // never overridden by this arbitration.
  // ---------------------------------------------------------------------------
  const ruleResult = ruleBasedCategorize(description);

  const strongExactKeyword =
    ruleResult.category &&
    ruleResult.source === 'keyword' && // 'keyword' = exact match, 'fuzzy' = typo-level match
    ruleResult.rawScore >= KEYWORD_STRONG_MATCH / 100;

  if (strongExactKeyword) {
    return finish({
      category: ruleResult.category,
      // Raw keyword confidence (95–98 for strong exact hits). No remap: remapping
      // only the strong band while weaker exact wins show raw values would make
      // confidence non-monotonic (a 0.98 match would display lower than a 0.90 one).
      confidence: ruleResult.confidence,
      source: 'keyword',
      matched_text: ruleResult.matchedKeyword || description,
      matchedKeyword: ruleResult.matchedKeyword,
      arbitration: { winner: 'keyword', reason: 'strong_exact_keyword', keyword_raw_score: ruleResult.confidence },
    });
  }

  const ml = await callMlCategorize(description);
  const { winner, diagnostics } = arbitrateKeywordVsMl(ruleResult, ml);

  if (winner && winner.fromRule) {
    return finish({
      category: ruleResult.category,
      confidence: ruleResult.confidence,
      source: 'keyword',
      matched_text: ruleResult.matchedKeyword || description,
      matchedKeyword: ruleResult.matchedKeyword,
      arbitration: { winner: 'keyword', ...diagnostics },
    });
  }

  if (winner && winner.result && winner.result.category) {
    return finish({
      category: winner.result.category,
      confidence: winner.result.confidence,
      source: 'ml',
      matched_text: description,
      arbitration: { winner: 'ml', ...diagnostics },
    });
  }

  let geminiFallbackReason = null;
  if (ml.reason) {
    geminiFallbackReason = `ml_fallback_${ml.reason}`;
  } else if (ruleResult.category) {
    // Both layers answered but neither met its eligibility bar.
    geminiFallbackReason = 'arbitration_below_thresholds';
  }

  // 6–7. Gemini (embedding + LLM) only as the final optional fallback
  if (hasGeminiApiKey()) {
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

        if (bestCategory && maxSimilarity >= 0.55) {
          const confidence = Math.round(80 + (maxSimilarity - 0.55) * (15 / 0.45));
          return finish({
            category: bestCategory,
            confidence: Math.min(95, confidence),
            source: 'embedding',
            matched_text: bestCategory
          });
        }
        geminiFallbackReason = 'embedding_below_threshold';
      } else {
        geminiFallbackReason = 'embedding_unavailable';
      }
    } catch (err) {
      geminiFallbackReason = 'embedding_error';
      console.warn('Semantic embedding similarity failed:', err.message || err);
    }

    const { result: aiResult, reason: aiReason, durationMs: aiMs } = await callGeminiCategorize(description);
    if (aiResult && aiResult.category) {
      return finish({
        category: aiResult.category,
        confidence: aiResult.confidence,
        source: 'ai',
        matched_text: description,
        explanation: aiResult.explanation || null,
      });
    }
    geminiFallbackReason = aiReason || geminiFallbackReason || `ai_failed_${aiMs}ms`;
  } else {
    geminiFallbackReason = 'MISSING_API_KEY';
  }

  // Final fallback using local rule if anything (low-confidence keyword answer
  // preserved exactly as before; Gemini stages were exhausted above)
  if (ruleResult.category) {
    return finish({
      category: ruleResult.category,
      confidence: ruleResult.confidence,
      source: 'keyword',
      matched_text: ruleResult.matchedKeyword || description,
      matchedKeyword: ruleResult.matchedKeyword,
    }, geminiFallbackReason);
  }

  return finish({
    category: null,
    confidence: 0,
    source: null,
    matched_text: null
  }, geminiFallbackReason || 'no_match');
}

module.exports = {
  categorizeTransaction,
  ruleBasedCategorize,
  levenshteinDistance,
  fuzzySimilarity,
};
