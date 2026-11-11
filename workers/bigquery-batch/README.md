# epir-bigquery-batch

Nocny eksport D1 → Pipelines → Iceberg; whitelist R2 SQL (`run_analytics_query` Q1–Q10).

## EDOG (monitoring przepływu)

| Element | Opis |
|---------|------|
| `GET /internal/flow-health` | Raport + `edog_verdict` — Bearer `DATA_GUARDIAN_OPS_KEY` |
| `GET /internal/export-status` | Watermark bez auth (ogranicz siecią) |
| Cron | `0 8`, `0 20` UTC — EDOG; `0 9` UTC — raport operatora; `0 2` UTC — eksport |
| KV | Opcjonalnie `DATA_GUARDIAN_KV` → klucz `edog:latest` (TTL 7 dni) |

Sekrety:

```bash
npx wrangler secret put DATA_GUARDIAN_OPS_KEY
```

Koszt monitoringu: kilka `COUNT` D1 + co najwyżej jedno R2 SQL (Q1) na przebieg, tylko gdy batch nie jest w stanie FAIL.

## Eksport pixel (D1 → Pipelines)

Paczka domyślnie 500 wierszy (`WAREHOUSE_PIXEL_EXPORT_BATCH_SIZE`, sufit przebiegu `WAREHOUSE_PIXEL_EXPORT_MAX_ROWS`), pauza 200 ms między paczkami catch-upu. Kursor `batch_exports.last_pixel_export_at` + `last_pixel_export_id` jest zapisywany po każdej udanej paczce i nie rusza się, gdy odczyt, ingest albo zapis kursora się nie uda. `D1 DB is overloaded` jest błędem przejściowym (retry, wykładniczy backoff, jitter).

Odczyt backlogu owija `created_at` w CASE/julianday, więc `idx_pixel_created_at` go nie obsługuje — bez indeksu wyrażeniowego `LIMIT` i tak skanuje tabelę. Indeks: `migrations/005_pixel_export_cursor_index.sql` na `jewelry-analytics-db`. Deploy workera go nie zakłada. Operator uruchamia migrację raz, poza oknem crona 02:00 UTC. Kursora nie zerować: następne przebiegi (02:00 i catch-up przed raportem 09:00) nadrabiają backlog od ostatniej zapisanej paczki.

Bramka kroków: [`docs/merge-gates/EDOG_IMPLEMENTATION_STEPS.md`](../../docs/merge-gates/EDOG_IMPLEMENTATION_STEPS.md).
