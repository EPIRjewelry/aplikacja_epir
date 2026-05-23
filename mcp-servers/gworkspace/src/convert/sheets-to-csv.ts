/**
 * Arkusz Google → CSV (token-optimized). Wartości z spreadsheets.values.get.
 */

export type SheetCell = string | number | boolean | null | undefined;

function escapeCsvField(value: SheetCell): string {
  if (value === null || value === undefined) return '';
  const s = String(value);
  if (/[",\r\n]/.test(s)) {
    return `"${s.replace(/"/g, '""')}"`;
  }
  return s;
}

/** Konwertuje macierz komórek na CSV (RFC 4180). Puste wiersze są pomijane. */
export function valuesToCsv(rows: SheetCell[][]): string {
  if (!rows.length) return '';
  const lines: string[] = [];
  for (const row of rows) {
    if (!row?.length) continue;
    const hasContent = row.some((c) => c !== null && c !== undefined && String(c).trim() !== '');
    if (!hasContent) continue;
    lines.push(row.map(escapeCsvField).join(','));
  }
  return lines.join('\n');
}

/** Normalizuje zakres z API (pierwszy wiersz może być krótszy). */
export function normalizeValueRows(rows: SheetCell[][]): SheetCell[][] {
  if (!rows.length) return [];
  const width = Math.max(...rows.map((r) => r?.length ?? 0));
  return rows.map((row) => {
    const base = row ?? [];
    if (base.length >= width) return [...base];
    return [...base, ...Array(width - base.length).fill('')];
  });
}

export function sheetValuesToCsv(rows: SheetCell[][]): string {
  return valuesToCsv(normalizeValueRows(rows));
}
