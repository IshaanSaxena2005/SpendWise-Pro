import { CATEGORY_KEYWORDS, CATEGORY_ALIASES, type ConfidenceLevel } from '../data/categoryKeywords';
import type { Category } from './api';

export type { ConfidenceLevel };

export type DetectionSource = 'learning' | 'keyword' | 'embedding' | 'ai' | null;

export interface CategoryDetectionResult {
  categoryId: number | null;
  categoryName: string | null;
  confidence: number;
  matchedKeyword: string | null;
  matched_text?: string | null;
  source: DetectionSource;
  confidenceLevel: ConfidenceLevel;
}

const NULL_RESULT: CategoryDetectionResult = {
  categoryId: null,
  categoryName: null,
  confidence: 0,
  matchedKeyword: null,
  source: null,
  confidenceLevel: 'Low',
};

export function getConfidenceLevel(confidence: number): ConfidenceLevel {
  if (confidence >= 85) return 'High';
  if (confidence >= 65) return 'Medium';
  return 'Low';
}

export function levenshteinDistance(a: string, b: string): number {
  const matrix: number[][] = [];

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

export function fuzzySimilarity(a: string, b: string): number {
  const cleanA = a.trim().toLowerCase();
  const cleanB = b.trim().toLowerCase();
  if (cleanA === cleanB) return 1;
  if (cleanA.length === 0 || cleanB.length === 0) return 0;

  const distance = levenshteinDistance(cleanA, cleanB);
  const maxLen = Math.max(cleanA.length, cleanB.length);
  return 1 - distance / maxLen;
}

function normalizeDescription(description: string): string {
  return description.trim().toLowerCase();
}

function findCategoryByName(
  categories: Category[],
  targetName: string,
): Category | null {
  const normalizedTarget = targetName.trim().toLowerCase();

  const exact = categories.find((c) => c.name.trim().toLowerCase() === normalizedTarget);
  if (exact) return exact;

  const aliases = CATEGORY_ALIASES[targetName] || [];
  for (const alias of aliases) {
    const aliasMatch = categories.find(
      (c) => c.name.trim().toLowerCase() === alias.trim().toLowerCase(),
    );
    if (aliasMatch) return aliasMatch;
  }

  let bestMatch: Category | null = null;
  let bestScore = 0;
  for (const category of categories) {
    const score = fuzzySimilarity(category.name, targetName);
    if (score > bestScore && score >= 0.7) {
      bestScore = score;
      bestMatch = category;
    }
  }
  if (bestMatch) return bestMatch;

  for (const category of categories) {
    const catName = category.name.trim().toLowerCase();
    if (catName.includes(normalizedTarget) || normalizedTarget.includes(catName)) {
      return category;
    }
  }

  return null;
}

interface KeywordMatch {
  categoryName: string;
  keyword: string;
  score: number;
  isFuzzy: boolean;
}

function findKeywordMatches(description: string): KeywordMatch[] {
  const normalizedDesc = normalizeDescription(description);
  if (!normalizedDesc) return [];

  const descWords = normalizedDesc.split(/\s+/).filter(Boolean);
  const matches: KeywordMatch[] = [];

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

export function detectCategory(
  description: string,
  categories: Category[],
): CategoryDetectionResult {
  if (!description || !description.trim() || !categories || categories.length === 0) {
    return { ...NULL_RESULT };
  }

  const matches = findKeywordMatches(description);
  if (matches.length === 0) {
    return { ...NULL_RESULT };
  }

  for (const match of matches) {
    const category = findCategoryByName(categories, match.categoryName);
    if (category) {
      const confidence = Math.round(match.score * 100);
      return {
        categoryId: category.id,
        categoryName: category.name,
        confidence,
        matchedKeyword: match.keyword,
        source: 'keyword',
        confidenceLevel: getConfidenceLevel(confidence),
      };
    }
  }

  return { ...NULL_RESULT };
}

const keywordDictCache = new Map<string, { flat: { keyword: string; categoryName: string; length: number }[] }>();

function getCachedKeywordDict() {
  const cacheKey = 'v1';
  const cached = keywordDictCache.get(cacheKey);
  if (cached) return cached;

  const flat: { keyword: string; categoryName: string; length: number }[] = [];
  for (const [categoryName, keywords] of Object.entries(CATEGORY_KEYWORDS)) {
    for (const keyword of keywords) {
      flat.push({ keyword: keyword.toLowerCase(), categoryName, length: keyword.length });
    }
  }
  flat.sort((a, b) => b.length - a.length);

  const dict = { flat };
  keywordDictCache.set(cacheKey, dict);
  return dict;
}

export function preloadKeywordCache() {
  getCachedKeywordDict();
}

let lastDetectionCache: {
  description: string;
  categoriesKey: string;
  result: CategoryDetectionResult;
} | null = null;

export function memoizedDetectCategory(
  description: string,
  categories: Category[],
): CategoryDetectionResult {
  const categoriesKey = categories.map((c) => `${c.id}:${c.name}`).join('|');
  const descKey = (description || '').trim().toLowerCase();

  if (
    lastDetectionCache &&
    lastDetectionCache.description === descKey &&
    lastDetectionCache.categoriesKey === categoriesKey
  ) {
    return lastDetectionCache.result;
  }

  const result = detectCategory(description, categories);
  lastDetectionCache = {
    description: descKey,
    categoriesKey,
    result,
  };
  return result;
}
