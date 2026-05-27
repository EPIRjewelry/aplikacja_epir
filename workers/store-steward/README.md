# epir-store-steward

Cloudflare Worker — Store Steward Faza 0 (agregacja analityki, wnioski).

## Dostęp (bez sekretów na tym workerze)

| Kto woła | Jak |
|----------|-----|
| Cron (04:00 UTC) | lokalnie w workerze |
| Inny worker | **RPC** `StoreStewardS2SRpc` (service binding) |
| Cursor / laptop | **HTTP** na `epir-analyst-worker`: `/v1/steward/*` + `ANALYST_HTTP_BEARER` |

**Nie ustawiaj** `EPIR_CHAT_SHARED_SECRET` na tym workerze.

Binding na `epir-analyst-worker`:

```toml
[[services]]
binding = "STORE_STEWARD_RPC"
service = "epir-store-steward"
entrypoint = "StoreStewardS2SRpc"
```

## Migracje D1

```bash
npx wrangler d1 execute jewelry-analytics-db --remote --file=./migrations/001_store_signals.sql
npx wrangler d1 execute jewelry-analytics-db --remote --file=./migrations/002_steward_insights.sql
npx wrangler d1 execute jewelry-analytics-db --remote --file=./migrations/003_steward_reports.sql
```

## Testy

```bash
npm run test
```
