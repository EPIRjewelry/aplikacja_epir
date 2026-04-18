/**
 * One-off backfill: `person_memory.summary` -> `memory_facts`.
 *
 * Wywołanie:
 *   npx wrangler d1 execute ai-assistant-sessions-db --command="SELECT shopify_customer_id, summary FROM person_memory WHERE LENGTH(TRIM(summary)) > 50" --json > /tmp/person_memory.json
 *   tsx workers/chat/scripts/backfill-memory-facts.ts /tmp/person_memory.json > /tmp/memory_facts.sql
 *   npx wrangler d1 execute ai-assistant-sessions-db --file=/tmp/memory_facts.sql
 *
 * Parsuje deterministycznie każdy istniejący `summary` (regex — ten sam co w
 * `memory/extractor.ts#extractFactsDeterministic`), oznacza `source_kind='legacy_summary'`.
 *
 * Skrypt celowo NIE woła LLM ani nie łączy się z siecią — dzięki temu jest
 * idempotentny i przewidywalny w CI. Jeśli chcesz bogatszej ekstrakcji — uruchom
 * consumer w trybie `reason='backfill'` (dla pojedynczego klienta naraz).
 */

import { extractFactsDeterministic, toMemoryFact } from '../src/memory/extractor';

type PersonMemoryDump = {
  result?: Array<{
    results?: Array<{ shopify_customer_id?: string; summary?: string }>;
  }>;
};

async function main() {
  const path = process.argv[2];
  if (!path) {
    console.error('Usage: tsx backfill-memory-facts.ts <path-to-person_memory-json>');
    process.exit(2);
  }
  const fs = await import('node:fs/promises');
  const raw = await fs.readFile(path, 'utf8');
  const parsed = JSON.parse(raw) as PersonMemoryDump | PersonMemoryDump['result'];
  const rows = Array.isArray(parsed)
    ? parsed.flatMap((r) => r.results ?? [])
    : parsed?.result?.flatMap((r) => r.results ?? []) ?? [];

  const inserts: string[] = [];
  const now = Date.now();

  for (const row of rows) {
    const customerId = String(row?.shopify_customer_id ?? '').trim();
    const summary = String(row?.summary ?? '').trim();
    if (!customerId || summary.length < 10) continue;

    const facts = extractFactsDeterministic([summary]);
    for (const fact of facts) {
      const memoryFact = toMemoryFact(fact, {
        shopifyCustomerId: customerId,
        sourceKind: 'legacy_summary',
        now,
      });
      const esc = (v: string | number | null | undefined) => {
        if (v == null) return 'NULL';
        const s = String(v).replace(/'/g, "''");
        return `'${s}'`;
      };
      inserts.push(
        `INSERT OR IGNORE INTO memory_facts (id, shopify_customer_id, slot, value, value_raw, confidence, source_session_id, source_message_id, source_kind, created_at, expires_at, superseded_by) VALUES (${esc(
          memoryFact.id,
        )}, ${esc(memoryFact.shopifyCustomerId)}, ${esc(memoryFact.slot)}, ${esc(memoryFact.value)}, ${esc(memoryFact.valueRaw ?? '')}, ${Math.min(
          1,
          Math.max(0, memoryFact.confidence * 0.8),
        )}, NULL, ${esc('backfill_' + customerId.slice(-12))}, ${esc(memoryFact.sourceKind)}, ${memoryFact.createdAt}, ${
          memoryFact.expiresAt ?? 'NULL'
        }, NULL);`,
      );
    }
  }

  console.log('-- backfill-memory-facts.sql (generated ' + new Date().toISOString() + ')');
  console.log('BEGIN;');
  for (const sql of inserts) console.log(sql);
  console.log('COMMIT;');
  console.error(`Generated ${inserts.length} INSERT statements from ${rows.length} person_memory rows.`);
}

main().catch((err) => {
  console.error('backfill failed:', err);
  process.exit(1);
});
