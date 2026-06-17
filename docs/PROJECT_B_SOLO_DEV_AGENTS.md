# Project B — Operator Studio (role, modele, API)

## Operator Studio

- **UI:** `GET /internal/operator-studio` — React ([`apps/operator-studio`](../apps/operator-studio/)), build: `npm run build:operator-studio`
- **API:** `/internal/operator-studio/api/*`
- **Kanał czatu:** `operator` (nie Gemma) — moduł [`workers/chat/src/operator/`](../workers/chat/src/operator/)
- **Role:** `X-EPIR-OPERATOR-ROLE` → `analyst` | `store_ops` | `design_blender` | `creative`
- **Raporty:** `GET …/api/reports`, `GET …/api/reports/:date`
- **Bramka:** [`docs/merge-gates/OPERATOR_STUDIO_V2_ESOG.md`](merge-gates/OPERATOR_STUDIO_V2_ESOG.md)

## Growth Engineer — podział Cursor vs Operator Studio

Architektura „Full-Stack Growth Engineer”: strategia poza runtime, wykonanie w Cursorze, codzienne użycie w Operator Studio. **Nie** budujemy drugiego backendu ani Google Sheets jako SSOT.

| Zadanie | Gdzie | Narzędzia / ścieżka |
|---------|--------|---------------------|
| Synteza strategii (DCO, kampanie, blueprint UI) | NotebookLM + operator | Mirror repo 1:1; wynik **niewiążący** do weryfikacji z kanonem |
| Edycja Liquid, Hydrogen, workers, deploy | **Cursor** | Composer; reguły `.cursor/rules/epir-brand-growth.mdc`, `epir-consent-tracking.mdc`, `epir-growth-workflow.mdc` |
| Odczyt briefu Google Docs/Sheets | **Cursor** (lokalnie) | MCP `epir-gworkspace` stdio — `gdocs_read_markdown` / `gsheets_read_csv` po `fileId` |
| Metryki, raport dzienny, GA4/Ads preview | **Operator Studio** | Rola `analyst`; D1 `operator_daily_reports`; `fetch_marketing_preview` |
| Copy / obrazy / brief w czacie | **Operator Studio** | Rola `creative`; OpenRouter; fragment briefu wklejony z Cursora (bez OAuth Google w panelu) |
| Eksport raportu na Drive (opcjonalnie) | **Worker** `bigquery-batch` | `GWORKSPACE_REPORT_WEBHOOK_URL` → [`EPIR_GWORKSPACE_REPORT_BRIDGE.md`](EPIR_GWORKSPACE_REPORT_BRIDGE.md) |
| Shopify Flow webhook (tylko przy timeout >5s) | **Worker** `chat` (plan PR3) | `200 OK` + `waitUntil` — nie GAS jako pierwszy hop |

**Przepływ:** zdarzenie / raport → D1 → Operator Studio → excerpt do NotebookLM → blueprint → Cursor → commit/deploy.

## Nagłówki

| Nagłówek | Znaczenie |
|----------|-----------|
| `X-Admin-Key` | `EPIR_OPERATOR_PANEL_SECRET` — auth operatora |
| `X-EPIR-OPERATOR-ROLE` | Rola operatora (patrz tabela poniżej) |
| `X-Epir-Model-Variant` | Klucz wariantu z `workers/chat/src/config/model-params.ts` (`or_*` = OpenRouter) |
| `X-Epir-OpenRouter-Model` | Dowolny slug z katalogu OR (`provider/model`), tylko z Bearer panelu; **niższy priorytet** niż `X-Epir-Model-Variant` |

Role operatora: kod źródłowy [`workers/chat/src/operator/operator-roles.ts`](../workers/chat/src/operator/operator-roles.ts).

## Role (lista w UI)

| ID | Etykieta | Narzędzia (skrót) |
|----|----------|-------------------|
| `analyst` | Analityk | `run_analytics_query`, `fetch_marketing_preview`, `run_shopify_shopifyql`, katalog |
| `store_ops` | Operacje sklepu | katalog, polityki, `operator_shopify_admin_read`, ShopifyQL |
| `design_blender` | Blender / CAD | `blender_bridge_invoke` |
| `creative` | Kreacja | brak narzędzi warehouse/Shopify — generacja w modelu OpenRouter |

**Google Workspace (lokalny MCP):** pakiet [`mcp-servers/gworkspace`](../mcp-servers/gworkspace/README.md) — odczyt briefu po **ID pliku** w Cursorze; wklej Markdown/CSV do Studia (rola `creative`).

**Uwaga:** ścieżka produkcyjna analityki to **D1 → Pipelines → Iceberg → R2 SQL**, nie Google BigQuery (nazwa `epir-bigquery-batch` jest historyczna).

## Profil operatora i raporty (D1)

- **Profil:** tabela `internal_operator_profile` w `ai-assistant-sessions-db`; API `GET/PUT /internal/operator-studio/api/operator-profile`
- **Digest sesji:** `internal_session_digest` — odświeżany co 6 wiadomości w sesji kanału `operator`
- **Raport dzienny:** cron `0 9 * * *` UTC na `epir-bigquery-batch` → `operator_daily_reports`; podgląd `GET /internal/operator-studio/api/operator-report/latest`
- **EDOG (monitoring):** `GET /internal/operator-studio/api/flow-health` + MCP `epir-data-ops`; opcjonalna twarda bramka na czacie tylko gdy `EDOG_GATE_ENABLED=true` (domyślnie `false`)
- **Workspace mostek:** opcjonalny `GWORKSPACE_REPORT_WEBHOOK_URL` — [`EPIR_GWORKSPACE_REPORT_BRIDGE.md`](EPIR_GWORKSPACE_REPORT_BRIDGE.md)

## Stanowe sesje czatu (solo: Analityk + CAD)

- **Osobna sesja per rola** w UI (`sessionStorage`: `epir_operator_session_analyst`, `epir_operator_session_design_blender`, …). Przełączenie roli przywraca historię z `POST …/api/history`.
- **„Nowa rozmowa”** resetuje tylko bieżącą rolę. Odświeżenie strony (F5) kontynuuje wątek.
- **Raporty dzienne** (zakładka Raporty) ≠ transkrypt czatu — to automatyczny digest analityka z D1.
- **Eksport na dysk D:\\** (role `analyst` i `design_blender`):
  1. Setup raz: `scripts\start-operator-export-bridge.ps1` (serwis `:9880`, foldery `D:\EPIR\operator-studio\analyst\` i `\cad\`).
  2. Tunel (opcjonalnie, do eksportu z chmury): `OPERATOR_EXPORT_ORIGIN` w [`workers/chat/wrangler.toml`](../workers/chat/wrangler.toml) — np. `https://operator-export.epirbizuteria.pl`.
  3. W Studiu: **Zapisz na dysk (D:\)** — worker woła most lokalny (`POST …/api/export-session`).


Warianty `or_*` mapują na `openrouter/<slug>` w [`model-params.ts`](../workers/chat/src/config/model-params.ts).

### Pełny katalog (proxy worker)

- **Endpoint:** `GET /internal/operator-studio/api/openrouter-models` + `X-Admin-Key`
- **Implementacja:** [`workers/chat/src/openrouter-catalog.ts`](../workers/chat/src/openrouter-catalog.ts) — cache **30 min**
- **UI:** Źródło modelu → *Katalog OpenRouter* lub *Preset Groq / or_**
- **Czat:** `X-Epir-OpenRouter-Model: <slug>` przy katalogu; worker waliduje slug w cache

### Recraft V4.1 (generacja obrazu)

| Klucz UI | Slug OpenRouter |
|----------|-----------------|
| `or_recraft_v41` | `recraft/recraft-v4.1` |
| `or_recraft_v41_vector` | `recraft/recraft-v4.1-vector` |
| `or_recraft_v41_pro` | `recraft/recraft-v4.1-pro` |
| `or_recraft_v41_pro_vector` | `recraft/recraft-v4.1-pro-vector` |
| `or_recraft_v41_utility` | `recraft/recraft-v4.1-utility` |
| `or_recraft_v41_utility_vector` | `recraft/recraft-v4.1-utility-vector` |
| `or_recraft_v41_utility_pro` | `recraft/recraft-v4.1-utility-pro` |
| `or_recraft_v41_utility_pro_vector` | `recraft/recraft-v4.1-utility-pro-vector` |

## Most Blender (Operator Studio ↔ Blender_assist)

- Materiał roboczy: [`EPIR_BLENDER_OPERATOR_STUDIO_BRIDGE.md`](EPIR_BLENDER_OPERATOR_STUDIO_BRIDGE.md)
- **Narzędzie czatu:** `blender_bridge_invoke` (rola `design_blender`, kanał `operator`)
- **UI:** panel „Most Blender” + `GET /internal/operator-studio/api/blender-bridge-health`

## Endpointy API (skrót)

| Metoda | Ścieżka |
|--------|---------|
| GET | `/internal/operator-studio` — UI React |
| POST | `/internal/operator-studio/api/chat` |
| GET | `/internal/operator-studio/api/ready` |
| GET | `/internal/operator-studio/api/flow-health` |
| GET/PUT | `/internal/operator-studio/api/operator-profile` |
| GET | `/internal/operator-studio/api/openrouter-models` |
| GET | `/internal/operator-studio/api/reports`, `…/reports/:date` |
| POST | `/internal/operator-studio/api/history` |
| POST | `/internal/operator-studio/api/export-session` |
| POST | `/internal/operator-studio/api/trigger-warehouse-export` |
| POST/GET | `/internal/operator-studio/api/steward/*` |

Auth: `X-Admin-Key` = `EPIR_OPERATOR_PANEL_SECRET`.
