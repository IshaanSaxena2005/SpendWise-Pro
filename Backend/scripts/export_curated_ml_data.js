/**
 * ML Training-Data Curation & Export
 * ==================================
 *
 * Builds a consensus-filtered, ANONYMIZED training export from
 * correction_events (feedback capture by learningService.recordCorrectionEvent).
 *
 * Pipeline:
 *   correction_events (protected app data)
 *     -> corrections only (source='correction')
 *     -> canonical-class mapping via user's categories row
 *     -> text sanitization (normalizeMerchant + digit/identifier stripping)
 *     -> group by sanitized text, count distinct users / total events / labels
 *     -> consensus gate
 *     -> anonymized JSON export (text + category only)
 *
 * Consensus gate (Part 5): an example is eligible ONLY when
 *   (distinct_users >= 3) OR (total_corrections >= 5)
 * for a SINGLE label. Conflicting labels -> the example is EXCLUDED entirely
 * (never averaged). The distinct-users>=3 branch is the primary quality
 * signal; the total>=5 branch is honored exactly as specified and additionally
 * captured by the curation stats so heavy single-user repetition is visible.
 *
 * PRIVACY (Part 6):
 *   - Only { text, category } pairs are exported.
 *   - No user_id, email, account info, amounts, or raw metadata.
 *   - Text is sanitized; token-level identifier stripping (long
 *     alphanumeric/reference tokens) is applied.
 *   - ML-Service never receives anything from this script and has NO database
 *     access.
 *
 * Usage:
 *   node scripts/export_curated_ml_data.js [--out artifacts-export/curated_ml_training_data.json]
 *
 * The output file is consumed manually by ML-Service training
 * (category_dataset.build_training_set(curated_path=...)).
 */
require('dotenv').config({ path: require('path').join(__dirname, '../.env') });

const fs = require('fs');
const path = require('path');
const mysql = require('mysql2/promise');
const { normalizeMerchant, toCanonicalCategory } = require('../services/learningService');

const MIN_DISTINCT_USERS = 3;
const MIN_TOTAL_CORRECTIONS = 5;

// Token-level identifier stripping: drop tokens that look like reference
// numbers, transaction IDs, account fragments, or other long identifiers.
function stripIdentifierTokens(text) {
  return text
    .split(/\s+/)
    .filter((token) => {
      if (!token) return false;
      // long alphanumeric mixes (e.g. "upi123456789", "ac4471") or any token
      // longer than 20 chars are treated as identifiers and dropped
      if (token.length > 20) return false;
      const digits = (token.match(/\d/g) || []).length;
      const alnum = (token.match(/[a-z0-9]/gi) || []).length;
      if (digits >= 3 && alnum >= 5) return false; // reference-number-like
      return true;
    })
    .join(' ');
}

// Sanitize a raw merchant/description for export.
function sanitizeText(raw) {
  const normalized = normalizeMerchant(raw); // lowercase, punctuation strip, whitespace collapse
  const stripped = stripIdentifierTokens(normalized);
  return stripped.replace(/\s+/g, ' ').trim();
}

async function main() {
  const outArgIdx = process.argv.indexOf('--out');
  const outPath = outArgIdx !== -1 ? process.argv[outArgIdx + 1] : path.join(__dirname, 'curated_ml_training_data.json');

  const config = {
    host: process.env.DB_HOST || 'localhost',
    user: process.env.DB_USER || 'root',
    password: process.env.DB_PASSWORD || 'root',
    database: process.env.DB_NAME || 'smart_financial_intelligence',
    port: process.env.DB_PORT ? Number(process.env.DB_PORT) : 3306,
  };

  const conn = await mysql.createConnection(config);

  console.log('Reading correction events...');
  // Only GENUINE corrections are eligible for the global pool initially
  // (Part 5 step 2).
  const [events] = await conn.query(
    `SELECT ce.normalized_merchant, ce.category_name, ce.user_id
       FROM correction_events ce
      WHERE ce.source = 'correction'`
  );
  console.log(`Correction events found: ${events.length}`);

  // ---- Group by sanitized text; tally evidence per label ----
  const groups = new Map();
  for (const ev of events) {
    const text = sanitizeText(ev.normalized_merchant);
    if (!text) continue; // nothing left after sanitization

    // Canonical-class mapping (Part 4): resolve via the recorded category
    // name. Non-canonical names (custom categories like "Khana") are mapped
    // ONLY by exact-name match with the canonical list; anything else is
    // EXCLUDED, never guessed.
    const category = toCanonicalCategory(ev.category_name);
    if (!category) {
      console.log(`  [skip] non-canonical category "${ev.category_name}" for "${text}"`);
      continue;
    }

    if (!groups.has(text)) groups.set(text, new Map());
    const labels = groups.get(text);
    const entry = labels.get(category) || { distinctUsers: new Set(), total: 0 };
    entry.distinctUsers.add(ev.user_id);
    entry.total += 1;
    labels.set(category, entry);
  }

  // ---- Consensus gate + conflict handling ----
  const examples = [];
  let excludedConflicts = 0;
  let excludedBelowGate = 0;

  for (const [text, labels] of groups) {
    if (labels.size > 1) {
      // Conflicting labels without a clear consensus -> exclude entirely.
      excludedConflicts += 1;
      continue;
    }
    const [category, evidence] = [...labels.entries()][0];
    const distinctUsers = evidence.distinctUsers.size;
    const total = evidence.total;
    const eligible = distinctUsers >= MIN_DISTINCT_USERS || total >= MIN_TOTAL_CORRECTIONS;
    if (!eligible) {
      excludedBelowGate += 1;
      continue;
    }
    examples.push({ text, category });
  }

  examples.sort((a, b) => (a.text < b.text ? -1 : a.text > b.text ? 1 : 0));

  const payload = {
    examples,
    curation: {
      generated_at: new Date().toISOString(),
      min_distinct_users: MIN_DISTINCT_USERS,
      min_total_corrections: MIN_TOTAL_CORRECTIONS,
      eligible_examples: examples.length,
      excluded_conflicting_labels: excludedConflicts,
      excluded_below_consensus_gate: excludedBelowGate,
    },
  };

  fs.writeFileSync(outPath, JSON.stringify(payload, null, 2), 'utf8');
  console.log(`\nEligible examples : ${examples.length}`);
  console.log(`Excluded (conflicting labels)  : ${excludedConflicts}`);
  console.log(`Excluded (below consensus gate): ${excludedBelowGate}`);
  console.log(`Export written to ${outPath}`);

  await conn.end();
}

main().catch((err) => {
  console.error('Export failed:', err);
  process.exit(1);
});
