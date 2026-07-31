# epir-data-ops (MCP lokalny)

Read-only MCP dla **EDOG** i **Kustosza EPIR** — audyt przepływu + hurtownia Q1–Q10 w Cursorze.

## Wymagane env (w `.cursor/mcp.json`, skopiuj z `.cursor/mcp-data-ops.example.json`)

| Zmienna | Opis |
|---------|------|
| `CLOUDFLARE_ACCOUNT_ID` | Konto CF |
| `CLOUDFLARE_API_TOKEN` | Token z **D1 Read** (bez Write) |
| `EPIR_BATCH_WORKER_ORIGIN` | URL `epir-bigquery-batch` (opcjonalnie / legacy) |
| `DATA_GUARDIAN_OPS_KEY` | Ops key batch (gdy używasz bezpośredniego flow-health na batch) |
| `EPIR_CHAT_WORKER_ORIGIN` lub `WORKER_ORIGIN` | Domyślnie `https://asystent.epirbizuteria.pl` — proxy flow-health |
| `EPIR_OPERATOR_PANEL_SECRET` | `X-Admin-Key` do `/internal/operator-studio/api/flow-health` |

Opcjonalnie (hurtownia Q1–Q10): `EPIR_ANALYST_WORKER_ORIGIN` + `ANALYST_HTTP_BEARER`.

## Narzędzia

- `flow_health_summary` — `GET …/operator-studio/api/flow-health`
- `flow_map_excerpt` — fragment `docs/EPIR_DATA_FLOW_MAP.md`
- `d1_metadata` / `d1_sample_rows` — allowlist tabel (bez `payload` / pełnego contentu wiadomości)
- `warehouse_probe` — tylko `Q1_CONVERSION_CHAT`
- `warehouse_query` — whitelist `Q1`–`Q10` (Cursor Kustosz)
- `operator_report_excerpt` — ostatni digest dzienny (skrót markdown)

## Koszt

Narzędzia D1/R2 uruchamiane **na żądanie** w IDE — nie zastępują crona EDOG (2×/dobę na workerze).

## Cursor desk

Playbook: [`.cursor/skills/epir-kustosz-agent/SKILL.md`](../../.cursor/skills/epir-kustosz-agent/SKILL.md).

## Smoke (IDE)

1. Ustaw User env: `CLOUDFLARE_ACCOUNT_ID`, `CLOUDFLARE_API_TOKEN` (D1 Read), `ANALYST_HTTP_BEARER`, `EPIR_ANALYST_WORKER_ORIGIN`, `EPIR_OPERATOR_PANEL_SECRET`.
2. Restart serwera MCP `epir-data-ops` w Cursorze.
3. `npm test -w @epir/mcp-data-ops`
4. Oczekiwane bez sekretów: analyst `GET /healthz` → 200; `POST /v1/warehouse/query` bez Bearer → 401; flow-health bez klucza → 401.
