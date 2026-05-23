import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '../../..');

export const D1_DATABASES = {
  jewelry_analytics: {
    label: 'jewelry-analytics-db',
    id: '6a4f7cbb-3c1c-42c7-9d79-4ef74d421f23',
    allowedTables: ['pixel_events', 'batch_exports'] as const,
  },
  ai_assistant_sessions: {
    label: 'ai-assistant-sessions-db',
    id: '475a1cb7-f1b5-47ba-94ed-40fd64c32451',
    allowedTables: ['messages', 'sessions'] as const,
  },
} as const;

export type D1DatabaseKey = keyof typeof D1_DATABASES;

const SAMPLE_COLUMNS: Record<string, readonly string[]> = {
  pixel_events: ['id', 'event_type', 'session_id', 'storefront_id', 'channel', 'created_at'],
  batch_exports: ['id', 'last_pixel_export_at', 'last_messages_export_at', 'updated_at'],
  messages: ['id', 'session_id', 'role', 'timestamp'],
  sessions: ['session_id', 'customer_id', 'created_at', 'last_activity'],
};

export function sampleColumnsFor(table: string): readonly string[] | undefined {
  return SAMPLE_COLUMNS[table];
}

export function resolveEnv(name: string): string {
  return (process.env[name] ?? '').trim();
}

export function flowMapExcerpt(): string {
  const path = join(ROOT, 'docs/EPIR_DATA_FLOW_MAP.md');
  const text = readFileSync(path, 'utf8');
  return text.length > 12_000 ? `${text.slice(0, 12_000)}\n…(truncated)` : text;
}
