# Model benchmarks — chat worker

Katalog na wyniki benchmarku wariantów modelu (`scripts/bench-models.ts`).

## Jak uruchomić

```bash
tsx workers/chat/scripts/bench-models.ts \
  --endpoint https://chat.epir-art-silver-jewellery.workers.dev \
  --admin-key "$ADMIN_KEY" \
  --variants default,k26,glm_flash \
  --out docs/benchmarks/$(date +%F)-models.md \
  --csv docs/benchmarks/$(date +%F)-models.csv \
  --repeats 3
```

Wymaga ustawionego `ADMIN_KEY` (sprawdź `wrangler secret list` dla workera `chat`).
`X-Epir-Model-Variant` działa wyłącznie z `Authorization: Bearer ${ADMIN_KEY}`.

## Co mierzymy

- `stream_ready_ms` — czas do otwarcia strumienia odpowiedzi (model init + prefill).
- `first_byte_ms`  — czas do pierwszego SSE eventu (TTFT).
- `stream_total_ms` — łączny czas do `done`.
- `prompt_tokens` / `completion_tokens` / `cached_tokens` — usage z Workers AI.
- `cache_hit_ratio = cached_tokens / prompt_tokens` — stabilność prefix cache.
- `finish_reason` — `stop` / `tool_calls` / `length`.
- `tool_calls_count` — ile narzędzi model wywołał.

## Uwagi

- Same metryki nie mówią nic o **jakości** odpowiedzi — ręczny review wyników jest konieczny
  przed decyzją o zmianie default variantu.
- Warianty ze `multimodal: false` nie nadają się do scenariuszy z obrazem — harness tego nie
  sprawdza (scenariusze są tekstowe).
- `cached_tokens` dla pierwszego requestu w sesji będzie ~0; dopiero kolejne tury w tej
  samej sesji pokażą trafność cache. Dla sensownego porównania uruchom z `--repeats 3+`.
