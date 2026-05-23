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

Bramka kroków: [`docs/merge-gates/EDOG_IMPLEMENTATION_STEPS.md`](../../docs/merge-gates/EDOG_IMPLEMENTATION_STEPS.md).
