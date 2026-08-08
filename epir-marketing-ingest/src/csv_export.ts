import { writeFileSync } from 'node:fs';
import type { GmcFeedRow } from './types.js';

function escapeCsv(value: string): string {
  if (/[",\n\r]/.test(value)) {
    return `"${value.replace(/"/g, '""')}"`;
  }
  return value;
}

export function feedRowsToCsv(columns: string[], rows: GmcFeedRow[]): string {
  const lines = [
    columns.join(','),
    ...rows.map((row) =>
      columns
        .map((col) => escapeCsv(String(row[col as keyof GmcFeedRow] ?? '')))
        .join(','),
    ),
  ];
  return `${lines.join('\n')}\n`;
}

export function writeFeedCsv(
  path: string,
  columns: string[],
  rows: GmcFeedRow[],
): number {
  writeFileSync(path, feedRowsToCsv(columns, rows), 'utf8');
  return rows.length;
}
