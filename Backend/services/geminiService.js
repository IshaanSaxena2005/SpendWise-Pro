const axios = require('axios');

const GEMINI_TIMEOUT_MS = 8000;
const GENERATE_MODELS = ['gemini-2.0-flash', 'gemini-1.5-flash', 'gemini-1.5-flash-latest'];
const EMBEDDING_MODEL = 'text-embedding-004';
const GENERATE_MODEL = GENERATE_MODELS[0];

const sessionCache = new Map();
const SESSION_CACHE_TTL_MS = 10 * 60 * 1000;
const SESSION_CACHE_MAX = 200;

function isDev() {
  return process.env.NODE_ENV !== 'production';
}

function hasGeminiApiKey() {
  // Presence only — never validate by prefix/length heuristics.
  return Boolean(process.env.GEMINI_API_KEY && String(process.env.GEMINI_API_KEY).trim());
}

function getApiKey() {
  const key = process.env.GEMINI_API_KEY;
  if (!key || !String(key).trim()) return null;
  return String(key).trim();
}

function sanitizePromptText(text, maxLen = 2000) {
  return String(text || '')
    .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, maxLen);
}

function extractJsonObject(rawText) {
  const text = String(rawText || '').trim();
  if (!text) return null;

  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/i);
  const candidate = fenced ? fenced[1].trim() : text;
  const jsonMatch = candidate.match(/\{[\s\S]*\}/);
  if (!jsonMatch) return null;

  try {
    return JSON.parse(jsonMatch[0]);
  } catch {
    return null;
  }
}

/**
 * Map Google Generative Language API errors to stable reason codes.
 * Uses HTTP status + Google error.status / error.message only — never key format.
 */
function classifyGeminiError(err) {
  if (!err.response) {
    if (err.code === 'ECONNABORTED' || String(err.message || '').toLowerCase().includes('timeout')) {
      return {
        reason: 'TIMEOUT',
        httpStatus: null,
        googleStatus: null,
        googleMessage: err.message || 'Request timed out',
        googleError: null,
      };
    }
    return {
      reason: 'NETWORK_ERROR',
      httpStatus: null,
      googleStatus: null,
      googleMessage: err.message || 'Network error',
      googleError: null,
    };
  }

  const httpStatus = err.response.status;
  const googleError = err.response.data?.error || err.response.data || null;
  const googleStatus = String(googleError?.status || '').toUpperCase();
  const googleMessage = googleError?.message || err.message || 'Unknown error';
  const messageLower = String(googleMessage).toLowerCase();

  let reason = 'API_FAILURE';

  if (httpStatus === 429 || googleStatus === 'RESOURCE_EXHAUSTED') {
    reason = 'QUOTA_EXCEEDED';
  } else if (
    googleStatus === 'PERMISSION_DENIED' ||
    httpStatus === 403
  ) {
    reason = 'PERMISSION_DENIED';
  } else if (
    googleStatus === 'NOT_FOUND' ||
    httpStatus === 404 ||
    messageLower.includes('is not found') ||
    messageLower.includes('model') && messageLower.includes('not found')
  ) {
    reason = 'MODEL_NOT_FOUND';
  } else if (
    googleStatus === 'INVALID_ARGUMENT' ||
    (httpStatus === 400 && !messageLower.includes('api key') && !messageLower.includes('api_key'))
  ) {
    // Prefer API_KEY_INVALID when Google explicitly says so
    if (
      messageLower.includes('api key not valid') ||
      messageLower.includes('api_key_invalid') ||
      messageLower.includes('invalid api key') ||
      googleStatus === 'API_KEY_INVALID'
    ) {
      reason = 'API_KEY_INVALID';
    } else {
      reason = 'INVALID_ARGUMENT';
    }
  } else if (
    messageLower.includes('api key not valid') ||
    messageLower.includes('api_key_invalid') ||
    messageLower.includes('invalid api key') ||
    googleStatus === 'API_KEY_INVALID' ||
    (httpStatus === 400 && (messageLower.includes('api key') || messageLower.includes('api_key')))
  ) {
    reason = 'API_KEY_INVALID';
  } else if (httpStatus === 401) {
    reason = 'API_KEY_INVALID';
  }

  return {
    reason,
    httpStatus,
    googleStatus: googleStatus || null,
    googleMessage,
    googleError,
  };
}

function logGeminiFailure(context, classified, durationMs, model) {
  const payload = {
    context,
    reason: classified.reason,
    httpStatus: classified.httpStatus,
    googleStatus: classified.googleStatus,
    googleMessage: classified.googleMessage,
    model: model || null,
    durationMs,
  };

  if (isDev()) {
    payload.googleError = classified.googleError;
    console.warn('[Gemini] request failed (dev detail):', JSON.stringify(payload, null, 2));
  } else {
    console.warn('[Gemini] request failed:', payload);
  }
}

function logGeminiSuccess(context, { model, durationMs, usageMetadata, cached }) {
  const payload = {
    context,
    ok: true,
    model,
    latencyMs: durationMs,
    cached: Boolean(cached),
    tokenUsage: usageMetadata
      ? {
          promptTokens: usageMetadata.promptTokenCount ?? null,
          candidatesTokens: usageMetadata.candidatesTokenCount ?? null,
          totalTokens: usageMetadata.totalTokenCount ?? null,
        }
      : null,
  };

  if (isDev()) {
    console.log('[Gemini] request succeeded (dev):', JSON.stringify(payload, null, 2));
  } else {
    console.log('[Gemini] request succeeded:', payload);
  }
}

function cacheGet(key) {
  const entry = sessionCache.get(key);
  if (!entry) return null;
  if (Date.now() - entry.at > SESSION_CACHE_TTL_MS) {
    sessionCache.delete(key);
    return null;
  }
  return entry.value;
}

function cacheSet(key, value) {
  if (sessionCache.size >= SESSION_CACHE_MAX) {
    const oldest = sessionCache.keys().next().value;
    sessionCache.delete(oldest);
  }
  sessionCache.set(key, { at: Date.now(), value });
}

/**
 * Call Gemini generateContent.
 * Never throws for missing key / API failures — returns { ok: false, reason, ... }.
 * Does not validate API key format; only real Google responses decide validity.
 */
async function generateContent({ prompt, temperature = 0.2, maxOutputTokens = 512, responseMimeType = null, cacheKey = null }) {
  const started = Date.now();
  const apiKey = getApiKey();

  if (!apiKey) {
    if (isDev()) {
      console.warn('[Gemini] missing_api_key — GEMINI_API_KEY is not set in environment');
    }
    return {
      ok: false,
      reason: 'MISSING_API_KEY',
      text: null,
      json: null,
      durationMs: Date.now() - started,
    };
  }

  if (cacheKey) {
    const cached = cacheGet(cacheKey);
    if (cached) {
      logGeminiSuccess('generateContent', {
        model: cached.model || GENERATE_MODEL,
        durationMs: Date.now() - started,
        usageMetadata: cached.usageMetadata || null,
        cached: true,
      });
      return {
        ...cached,
        ok: true,
        cached: true,
        durationMs: Date.now() - started,
      };
    }
  }

  const safePrompt = sanitizePromptText(prompt, 8000);
  const generationConfig = {
    temperature,
    maxOutputTokens,
  };
  if (responseMimeType) {
    generationConfig.responseMimeType = responseMimeType;
  }

  let lastFailure = null;

  for (const model of GENERATE_MODELS) {
    const endpoint = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`;
    try {
      const response = await axios.post(
        endpoint,
        {
          contents: [{ parts: [{ text: safePrompt }] }],
          generationConfig,
        },
        {
          timeout: GEMINI_TIMEOUT_MS,
          headers: { 'Content-Type': 'application/json' },
        },
      );

      const text = response?.data?.candidates?.[0]?.content?.parts?.[0]?.text || '';
      const usageMetadata = response?.data?.usageMetadata || null;
      const json = extractJsonObject(text);
      const durationMs = Date.now() - started;

      if (!text) {
        const emptyFailure = {
          reason: 'EMPTY_RESPONSE',
          httpStatus: response.status,
          googleStatus: null,
          googleMessage: 'Empty candidate text',
          googleError: response.data || null,
        };
        logGeminiFailure('generateContent', emptyFailure, durationMs, model);
        return {
          ok: false,
          reason: 'EMPTY_RESPONSE',
          text: null,
          json: null,
          durationMs,
          model,
        };
      }

      logGeminiSuccess('generateContent', { model, durationMs, usageMetadata, cached: false });

      const result = {
        ok: true,
        reason: null,
        text,
        json,
        durationMs,
        cached: false,
        model,
        usageMetadata,
      };

      if (cacheKey) {
        cacheSet(cacheKey, {
          ok: true,
          reason: null,
          text,
          json,
          model,
          usageMetadata,
        });
      }

      return result;
    } catch (err) {
      const classified = classifyGeminiError(err);
      lastFailure = { ...classified, model };
      logGeminiFailure('generateContent', classified, Date.now() - started, model);

      // Only try the next model when this one is missing
      if (classified.reason !== 'MODEL_NOT_FOUND') {
        break;
      }
    }
  }

  return {
    ok: false,
    reason: lastFailure?.reason || 'API_FAILURE',
    httpStatus: lastFailure?.httpStatus || null,
    googleStatus: lastFailure?.googleStatus || null,
    googleMessage: lastFailure?.googleMessage || null,
    text: null,
    json: null,
    durationMs: Date.now() - started,
    cached: false,
    model: lastFailure?.model || null,
  };
}

async function getEmbedding(text) {
  const started = Date.now();
  const apiKey = getApiKey();
  if (!apiKey) {
    if (isDev()) {
      console.warn('[Gemini] missing_api_key — GEMINI_API_KEY is not set in environment');
    }
    return { ok: false, reason: 'MISSING_API_KEY', vector: null, durationMs: Date.now() - started };
  }

  const safeText = sanitizePromptText(text, 1000);
  const cacheKey = `embed:${safeText.toLowerCase()}`;
  const cached = cacheGet(cacheKey);
  if (cached?.vector) {
    logGeminiSuccess('embedContent', {
      model: EMBEDDING_MODEL,
      durationMs: Date.now() - started,
      usageMetadata: null,
      cached: true,
    });
    return { ok: true, reason: null, vector: cached.vector, durationMs: Date.now() - started, cached: true };
  }

  try {
    const endpoint = `https://generativelanguage.googleapis.com/v1beta/models/${EMBEDDING_MODEL}:embedContent?key=${apiKey}`;
    const response = await axios.post(
      endpoint,
      {
        model: `models/${EMBEDDING_MODEL}`,
        content: { parts: [{ text: safeText }] },
      },
      { timeout: 5000 },
    );

    const vector = response.data?.embedding?.values || null;
    const durationMs = Date.now() - started;
    if (!vector) {
      const emptyFailure = {
        reason: 'EMPTY_RESPONSE',
        httpStatus: response.status,
        googleStatus: null,
        googleMessage: 'Empty embedding values',
        googleError: response.data || null,
      };
      logGeminiFailure('embedContent', emptyFailure, durationMs, EMBEDDING_MODEL);
      return { ok: false, reason: 'EMPTY_RESPONSE', vector: null, durationMs };
    }

    cacheSet(cacheKey, { vector });
    logGeminiSuccess('embedContent', {
      model: EMBEDDING_MODEL,
      durationMs,
      usageMetadata: response.data?.usageMetadata || null,
      cached: false,
    });
    return {
      ok: true,
      reason: null,
      vector,
      durationMs,
      cached: false,
      model: EMBEDDING_MODEL,
    };
  } catch (err) {
    const classified = classifyGeminiError(err);
    logGeminiFailure('embedContent', classified, Date.now() - started, EMBEDDING_MODEL);
    return {
      ok: false,
      reason: classified.reason,
      httpStatus: classified.httpStatus,
      googleStatus: classified.googleStatus,
      googleMessage: classified.googleMessage,
      vector: null,
      durationMs: Date.now() - started,
    };
  }
}

/**
 * Live connectivity probe — makes a real Gemini request.
 * Use for diagnostics; does not rely on key-format heuristics.
 */
async function probeGemini() {
  const started = Date.now();
  if (!hasGeminiApiKey()) {
    return {
      ok: false,
      reason: 'MISSING_API_KEY',
      durationMs: Date.now() - started,
    };
  }

  const result = await generateContent({
    prompt: 'Return ONLY valid JSON: {"ok":true,"service":"spendwise"}',
    temperature: 0,
    maxOutputTokens: 64,
    responseMimeType: 'application/json',
    cacheKey: null,
  });

  return {
    ok: result.ok,
    reason: result.reason,
    model: result.model || null,
    latencyMs: result.durationMs,
    tokenUsage: result.usageMetadata
      ? {
          promptTokens: result.usageMetadata.promptTokenCount ?? null,
          candidatesTokens: result.usageMetadata.candidatesTokenCount ?? null,
          totalTokens: result.usageMetadata.totalTokenCount ?? null,
        }
      : null,
    httpStatus: result.httpStatus || null,
    googleStatus: result.googleStatus || null,
    googleMessage: result.googleMessage || null,
    sample: result.json || (result.text ? String(result.text).slice(0, 120) : null),
  };
}

module.exports = {
  hasGeminiApiKey,
  generateContent,
  getEmbedding,
  probeGemini,
  classifyGeminiError,
  extractJsonObject,
  sanitizePromptText,
  GENERATE_MODEL,
  EMBEDDING_MODEL,
};
