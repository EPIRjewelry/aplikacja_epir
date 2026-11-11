import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import {
  PIXEL_CREATED_AT_MS_SQL,
  PIXEL_ID_TEXT_SQL,
  pixelExportSelectSql,
  pixelPendingCountSql,
} from './d1-timestamps';

const migrationPath = join(
  dirname(fileURLToPath(import.meta.url)),
  '../migrations/005_pixel_export_cursor_index.sql',
);

function norm(sql: string): string {
  return sql.replace(/\s+/g, ' ').trim();
}

describe('idx_pixel_export_cursor', () => {
  const ddl = readFileSync(migrationPath, 'utf8');

  it('indexes the same expressions the backlog queries filter on', () => {
    const n = norm(ddl);
    expect(n).toContain('CREATE INDEX IF NOT EXISTS idx_pixel_export_cursor');
    expect(n).toContain(norm(PIXEL_CREATED_AT_MS_SQL));
    expect(n).toContain(norm(PIXEL_ID_TEXT_SQL));
  });

  it('SEARCH-es the expression index for the export page and the pending count', async () => {
    let sqlite: typeof import('node:sqlite') | null = null;
    try {
      sqlite = await import('node:sqlite');
    } catch {
      sqlite = null;
    }
    if (!sqlite) return;

    const db = new sqlite.DatabaseSync(':memory:');
    db.exec(`CREATE TABLE pixel_events (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      created_at INTEGER NOT NULL,
      session_id TEXT
    );`);
    const insert = db.prepare('INSERT INTO pixel_events (created_at, session_id) VALUES (?, ?)');
    for (let i = 0; i < 400; i++) insert.run(1_700_000_000_000 + i * 1000, 's');
    db.exec('CREATE INDEX idx_pixel_created_at ON pixel_events(created_at);');
    db.exec(ddl);

    const selectPlan = db.prepare(`EXPLAIN QUERY PLAN ${pixelExportSelectSql()}`).all() as {
      detail: string;
    }[];
    const countPlan = db.prepare(`EXPLAIN QUERY PLAN ${pixelPendingCountSql()}`).all() as {
      detail: string;
    }[];
    const selectDetail = selectPlan.map((r) => r.detail).join(' ');
    const countDetail = countPlan.map((r) => r.detail).join(' ');

    expect(selectDetail).toContain('SEARCH');
    expect(selectDetail).toContain('idx_pixel_export_cursor');
    expect(selectDetail).not.toContain('USE TEMP B-TREE');
    expect(countDetail).toContain('SEARCH');
    expect(countDetail).toContain('idx_pixel_export_cursor');
    db.close();
  });
});
