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
| `EPIR_READONLY_ANALYTICS_KEY` | **Wymagany** `X-Admin-Key` do flow-health (tylko odczyt). Bez tego narzędzie zwraca czytelny błąd. |

Hurtownia i marketing: ten sam `EPIR_READONLY_ANALYTICS_KEY` na Operator Studio (`EPIR_CHAT_WORKER_ORIGIN`, domyślnie `https://asystent.epirbizuteria.pl`). Nie ustawiaj `EPIR_OPERATOR_PANEL_SECRET` w MCP.

`EPIR_ANALYST_WORKER_ORIGIN` + `ANALYST_HTTP_BEARER` są legacy (analyst-worker, w tym Q3). Bieżący odczyt Q* idzie przez Studio i **nie** obejmuje `Q3_TOP_CHAT_QUESTIONS`.

## Narzędzia

- `flow_health_summary` — `GET …/operator-studio/api/flow-health`
- `flow_map_excerpt` — fragment `docs/EPIR_DATA_FLOW_MAP.md`
- `d1_metadata` / `d1_sample_rows` — allowlist tabel (bez `payload` / pełnego contentu wiadomości)
- `warehouse_probe` — tylko `Q1_CONVERSION_CHAT` (Operator Studio, readonly)
- `warehouse_query` — Q1–Q10 **bez** `Q3_TOP_CHAT_QUESTIONS` (treść wiadomości; wymaga pełnego klucza panelu)
- `marketing_preview` — agregaty GA4 + Ads + GMC (`GET …/api/marketing-preview`)
- `gmc_diagnostics` — diagnostyka Merchant (read-only)
- `ads_account_change_audit` — audyt konta Ads bez e-maili i bez mutacji
- `operator_report_excerpt` — ostatni digest dzienny (skrót markdown)

## Koszt

Narzędzia D1/R2 uruchamiane **na żądanie** w IDE — nie zastępują crona EDOG (2×/dobę na workerze).

## Cursor desk

Playbook: [`.cursor/skills/epir-kustosz-agent/SKILL.md`](../../.cursor/skills/epir-kustosz-agent/SKILL.md).

## Smoke (IDE)

1. Ustaw User env: `CLOUDFLARE_ACCOUNT_ID`, `CLOUDFLARE_API_TOKEN` (D1 Read), `ANALYST_HTTP_BEARER`, `EPIR_ANALYST_WORKER_ORIGIN`, `EPIR_READONLY_ANALYTICS_KEY` (wymagany; bez `EPIR_OPERATOR_PANEL_SECRET` w MCP).
2. Restart serwera MCP `epir-data-ops` w Cursorze.
3. `npm test -w @epir/mcp-data-ops`
4. Oczekiwane bez sekretów: flow-health i `analytics/query` bez klucza → 401. Z `EPIR_READONLY_ANALYTICS_KEY`: Q1 oraz Q2, Q4–Q10 → 200; `Q3` / `Q3_TOP_CHAT_QUESTIONS` → 403.

### queryId readonly (Operator Studio)

Dozwolone dla `EPIR_READONLY_ANALYTICS_KEY` (pełne id albo skrót):

| Skrót | queryId |
|-------|---------|
| Q1 | `Q1_CONVERSION_CHAT` |
| Q2 | `Q2_CONVERSION_PATHS` |
| Q4 | `Q4_STOREFRONT_SEGMENTATION` |
| Q5 | `Q5_TOP_PRODUCTS` |
| Q6 | `Q6_CHAT_ENGAGEMENT` |
| Q7 | `Q7_PRODUCT_TO_PURCHASE` |
| Q8 | `Q8_DAILY_EVENTS` |
| Q9 | `Q9_TOOL_USAGE` |
| Q10 | `Q10_SESSION_DURATION` |

Wykluczone: `Q3` / `Q3_TOP_CHAT_QUESTIONS`.

`MARKETING_OPS_PREVIEW_KEY` nie jest potrzebny do tych narzędzi. Zostaje sekretem Cloudflare na `epir-marketing-ingest` (bez commitu). Bezpośredni `GET /ops/marketing-preview` na `*.workers.dev` używa go jako `Authorization: Bearer`, gdy most Operator Studio nie jest jeszcze wdrożony.
