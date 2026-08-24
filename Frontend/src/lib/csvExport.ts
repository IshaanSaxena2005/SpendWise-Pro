/**
 * Escape a single value for safe CSV output.
 * - Wraps every value in double quotes
 * - Escapes internal double quotes by doubling them
 * - Converts null/undefined to empty string
 */
function escapeCSVField(value: unknown): string {
  const str = value == null ? '' : String(value);
  // Double any existing double quotes, then wrap the whole field
  return `"${str.replace(/"/g, '""')}"`;
}

/**
 * Serialize a 2D array of values into a CSV string with proper RFC 4180 escaping.
 *
 * Usage:
 *   const csv = toCSV(
 *     ['Date', 'Description', 'Category', 'Amount', 'Notes'],
 *     transactions.map(t => [t.date, t.desc, t.cat, t.amount, t.notes])
 *   );
 */
export function toCSV(header: string[], rows: unknown[][]): string {
  const lines: string[] = [];
  lines.push(header.map(escapeCSVField).join(','));
  for (const row of rows) {
    lines.push(row.map(escapeCSVField).join(','));
  }
  return lines.join('\n');
}

/**
 * Trigger a browser CSV file download.
 */
export function downloadCSV(filename: string, csvString: string): void {
  const blob = new Blob([csvString], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}
