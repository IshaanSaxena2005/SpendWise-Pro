require('dotenv').config();
const { ruleBasedCategorize, categorizeTransaction } = require('./services/categorizeService');

const testCases = [
  { desc: 'potato', expected: 'Food', source: 'ml' },
  { desc: 'aloo paratha', expected: 'Food', source: 'ml' },
  { desc: 'paneer tikka', expected: 'Food', source: 'ml' },
  { desc: 'Netflix', expected: 'Entertainment', source: 'ml' },
  { desc: 'petrol', expected: 'Fuel', source: 'ml' },
  { desc: 'Amazon shoes', expected: 'Shopping', source: 'ml' },
  { desc: 'Apollo Pharmacy', expected: 'Health', source: 'ml' },
  { desc: 'Uber', expected: 'Travel', source: 'ml' },
  { desc: 'electricity bill', expected: 'Bills', source: 'keyword' },
  { desc: 'monthly salary credited', expected: 'Salary', source: 'keyword' },
];

async function run() {
  console.log('=== BACKEND CATEGORIZE PIPELINE INTEGRATION TEST ===');
  console.log('(No userId = rules + ML layers exercised; user learning skipped)\n');

  let correct = 0;
  for (const tc of testCases) {
    try {
      const result = await categorizeTransaction(null, tc.desc);
      const ok = result.category === tc.expected;
      if (ok) correct++;
      const status = ok ? 'PASS' : 'FAIL';
      const color = ok ? '\x1b[32m' : '\x1b[31m';
      const reset = '\x1b[0m';
      console.log(
        `${color}[${status}]${reset} '${tc.desc}' -> ` +
        `predicted='${result.category ?? 'null'}' expected='${tc.expected}' ` +
        `source='${result.source}' conf=${result.confidence}%`
      );
    } catch (e) {
      console.log(`[ERROR] '${tc.desc}' -> ${e.message}`);
    }
  }

  const total = testCases.length;
  const pct = ((correct / total) * 100).toFixed(1);
  console.log(`\nPipeline Result: ${correct}/${total} correct (${pct}%)`);
  process.exit(correct === total ? 0 : 1);
}

run();
