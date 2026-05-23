# EPIR — mapa przepływu danych (operacyjna)

**Status:** kanoniczny skrót dla **EDOG** i operatorów. Szczegóły kontraktu: [`EPIR_ANALYTICS_DATA_CONTRACT.md`](EPIR_ANALYTICS_DATA_CONTRACT.md).

## Warstwy

| Warstwa | Komponent | Deploy / binding |
|---------|-----------|------------------|
| Capture | Web Pixel | `extensions/my-web-pixel` → `epir-art-jewellery-worker` `/pixel` |
| Capture | Wiadomości czatu | `epir-art-jewellery-worker` → D1 `ai-assistant-sessions-db` (`DB_CHATBOT`) |
| Operational D1 | Zdarzenia pixel | `jewelry-analytics-db` (`DB` na analytics + bigquery-batch) — tabela `pixel_events` |
| Batch | Eksport do Pipelines | `epir-bigquery-batch` cron **`0 2 * * *` UTC** — watermark `batch_exports` |
| Warehouse | Iceberg + R2 SQL | Bucket `epir-analytics-iceberg-warehouse`, namespace `analytics` |
| Read tools | Whitelist zapytań | RPC `BigQueryBatchS2SRpc.runAnalyticsQuery` — `queryId` **Q1–Q10** |
| CQRS charts | Materializacja | `epir-analityc-worker` cron **`30 3 * * *` UTC**, KV `CHART_EDGE_CACHE` |
| Marketing | GA4 + Ads | `epir-marketing-ingest` → Pipelines namespace `marketing` |
| Project B sidecar | Podgląd marketingu | `epir_analityc` → `GET /ops/marketing-preview` (nie hurtownia pixel) |

## Endpointy ops (EDOG)

| Endpoint | Worker | Auth | Cel |
|----------|--------|------|-----|
| `GET /internal/export-status` | `epir-bigquery-batch` | brak (ogranicz dostęp siecią / Access) | Watermark eksportu, `pending_pixel_events` |
| `GET /internal/flow-health` | `epir-bigquery-batch` | Bearer `DATA_GUARDIAN_OPS_KEY` | Pełny raport + `edog_verdict` |
| `GET /healthz` | wszyscy | brak | Żywotność workera |

## Granice odpowiedzialności

- **EDCG** — zgodność kodu i kontraktu (PR, `validate-data-contract.py`).
- **EDOG** — stan produkcyjny przepływu (D1, batch, opcjonalnie sonda Q1, raport KV).
- **`internal_analytics`** — interpretacja liczb **po** `EDOG: PASS` na `flow-health` (tryb `data_flow_audit` w Operator Studio).
- **`epir_analityc`** — marketing sidecar; **nie** czyta `run_analytics_query` / pixel Iceberg.

## D1 (identyfikatory z wrangler)

| Nazwa | database_id (prod) | Binding |
|-------|-------------------|---------|
| `jewelry-analytics-db` | `6a4f7cbb-3c1c-42c7-9d79-4ef74d421f23` | `DB` |
| `ai-assistant-sessions-db` | `475a1cb7-f1b5-47ba-94ed-40fd64c32451` | `DB_CHATBOT` |

## Pliki implementacji

- Batch + flow-health: [`workers/bigquery-batch/src/`](../workers/bigquery-batch/src/)
- Kontrakt SQL: [`workers/bigquery-batch/src/analytics-queries.ts`](../workers/bigquery-batch/src/analytics-queries.ts)
- Bramka kroków EDOG: [`merge-gates/EDOG_IMPLEMENTATION_STEPS.md`](merge-gates/EDOG_IMPLEMENTATION_STEPS.md)
