/**
 * Metryki pamięci (`tag: chat.memory`) — ustrukturyzowane logi łapane przez
 * observability Workers (Cloudflare Logs → Grafana/Dataset).
 *
 * Konwencja: jeden event per log line, kluczowe pola stałe.
 */

export type MemoryMetricEvent =
  | { tag: 'chat.memory'; phase: 'extract'; latency_ms: number; facts_new: number; facts_dedup: number; events_new: number; raw_turns_indexed: number; vectors_upserted: number; session_id?: string; customer_id?: string; reason?: string }
  | { tag: 'chat.memory'; phase: 'extract_failure'; error: string; session_id?: string; customer_id?: string; retry?: number }
  | { tag: 'chat.memory'; phase: 'embed'; latency_ms: number; model: string; masked: boolean; chars: number }
  | { tag: 'chat.memory'; phase: 'embed_failure'; error: string; model: string }
  | { tag: 'chat.memory'; phase: 'retrieve'; latency_ms: number; topk_hits: number; customer_id: string; kind: 'fact' | 'turn' }
  | { tag: 'chat.memory'; phase: 'summary_build'; source: 'deterministic' | 'llm_enriched' | 'fallback'; chars: number; customer_id: string }
  | { tag: 'chat.memory'; phase: 'kb_guard_blocked'; reason: string; role: string; customer_id?: string; tool_name?: string }
  | { tag: 'chat.memory'; phase: 'queue_enqueue'; customer_id: string; idempotency_key: string; turns: number }
  | { tag: 'chat.memory'; phase: 'queue_dlq'; customer_id?: string; reason: string; retries?: number }
  | { tag: 'chat.memory'; phase: 'erasure'; customer_id: string; facts_deleted: number; events_deleted: number; raw_deleted: number; vectors_deleted: boolean };

export function emitMemoryMetric(event: MemoryMetricEvent): void {
  try {
    console.log(JSON.stringify(event));
  } catch {
    // ignorujemy — metryki nie mogą rzucać
  }
}
