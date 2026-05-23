# epir-data-ops (MCP lokalny)

Read-only MCP dla agenta **EDOG** — audyt przepływu danych EPIR w Cursorze.

## Wymagane env (w `.cursor/mcp.json`, skopiuj z `.cursor/mcp-data-ops.example.json`)

| Zmienna | Opis |
|---------|------|
| `CLOUDFLARE_ACCOUNT_ID` | Konto CF |
| `CLOUDFLARE_API_TOKEN` | Token z **D1 Read** (bez Write) |
| `EPIR_BATCH_WORKER_ORIGIN` | URL `epir-bigquery-batch` (np. `https://epir-bigquery-batch.<account>.workers.dev`) |
| `DATA_GUARDIAN_OPS_KEY` | Ten sam secret co na workerze (`wrangler secret put DATA_GUARDIAN_OPS_KEY`) |

Opcjonalnie: `EPIR_ANALYST_WORKER_ORIGIN` + `ANALYST_HTTP_BEARER` dla `warehouse_probe` (Q1 przez analyst-worker).

## Narzędzia

- `flow_health_summary` — `GET /internal/flow-health`
- `d1_metadata` / `d1_sample_rows` — allowlist tabel (bez `payload`)
- `warehouse_probe` — tylko `Q1_CONVERSION_CHAT`
- `flow_map_excerpt` — fragment `docs/EPIR_DATA_FLOW_MAP.md`

## Koszt

Narzędzia D1/R2 uruchamiane **na żądanie** w IDE — nie zastępują crona EDOG (2×/dobę na workerze).
