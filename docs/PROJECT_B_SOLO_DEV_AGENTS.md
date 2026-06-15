# Project B — agenci i modele (solo-dev-chat / Operator Studio)

## Operator Studio v2 (2026-06)

- **UI:** `GET /internal/operator-studio` — React ([`apps/operator-studio`](../apps/operator-studio/)), build: `npm run build:operator-studio`
- **API:** `/internal/operator-studio/api/*` (alias do `/internal/solo-dev-chat/api/*`)
- **Kanał czatu:** `operator` (nie Gemma) — moduł [`workers/chat/src/operator/`](../workers/chat/src/operator/)
- **Role:** `X-EPIR-OPERATOR-ROLE` → `analyst` | `store_ops` | `design_blender` | `creative`
- **Raporty:** `GET …/api/reports`, `GET …/api/reports/:date`
- **Bramka:** [`docs/merge-gates/OPERATOR_STUDIO_V2_ESOG.md`](merge-gates/OPERATOR_STUDIO_V2_ESOG.md)

Legacy (deprecated UI):

- `GET /internal/solo-dev-chat` — stary HTML ([`solo-dev-ui/`](../workers/chat/src/solo-dev-ui/)), kanał `internal-dashboard`

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
| `X-EPIR-AGENT-PRESET` | Rola agenta (patrz tabela poniżej) |
| `X-Epir-Model-Variant` | Klucz wariantu z `workers/chat/src/config/model-params.ts` (`or_*` = OpenRouter) |
| `X-Epir-OpenRouter-Model` | Dowolny slug z katalogu OR (`provider/model`), tylko z Bearer panelu; **niższy priorytet** niż `X-Epir-Model-Variant` |

Presety agenta: kod źródłowy [`workers/chat/src/solo-dev-agent-presets.ts`](../workers/chat/src/solo-dev-agent-presets.ts).

## Agenci (lista rozwijana)

| ID | Grupa | Domyślny model (variant) |
|----|-------|---------------------------|
| `internal_analytics` | Operacje | `default` (Groq GPT-OSS-120B) |
| `creative_svg` | Projektowanie | `or_claude_sonnet_4` |
| `creative_copy` | Projektowanie | `or_gpt4o_mini` |
| `creative_image` | Projektowanie | `or_recraft_v41_utility_vector` |
| `creative_blender_flow` | Projektowanie | `or_gpt4o` |
| `creative_gdocs_brief` | Projektowanie | `or_claude_sonnet_4` |
| `creative_storefront` | Storefront | (katalog OR lub preset) |

**Google Workspace (lokalny MCP):** pakiet [`mcp-servers/gworkspace`](../mcp-servers/gworkspace/README.md) — odczyt briefu po **ID pliku** (`gdocs_read_markdown`, `gsheets_read_csv`). Konfiguracja Cursor: [`.cursor/mcp-gworkspace.example.json`](../.cursor/mcp-gworkspace.example.json). Sekrety OAuth tylko lokalnie (keychain).

Pod listami **Agent** i **Model** panel pokazuje krótkie opisy (`uiHint` w presetach + mapa modeli) — aktualizują się przy zmianie wyboru.

**Uwaga:** ścieżka produkcyjna analityki to **D1 → Pipelines → Iceberg → R2 SQL**, nie Google BigQuery (nazwa `epir-bigquery-batch` jest historyczna).

## Profil operatora i raporty (D1)

- **Profil:** tabela `internal_operator_profile` w `ai-assistant-sessions-db`; API `GET/PUT /internal/solo-dev-chat/api/operator-profile` (panel zapisuje do D1, nie tylko `sessionStorage`).
- **Digest sesji:** `internal_session_digest` — odświeżany co 6 wiadomości w sesji `internal-dashboard`.
- **Raport dzienny:** cron `0 9 * * *` UTC na `epir-bigquery-batch` → `operator_daily_reports`; podgląd `GET /internal/solo-dev-chat/api/operator-report/latest`.
- **EDOG (monitoring):** `GET /internal/flow-health` + MCP `epir-data-ops`; opcjonalna twarda bramka na czacie tylko gdy `EDOG_GATE_ENABLED=true` (domyślnie `false`).
- **Workspace mostek:** opcjonalny `GWORKSPACE_REPORT_WEBHOOK_URL` — [`EPIR_GWORKSPACE_REPORT_BRIDGE.md`](EPIR_GWORKSPACE_REPORT_BRIDGE.md).

## Modele OpenRouter

Warianty `or_*` mapują na `openrouter/<slug>` w [`model-params.ts`](../workers/chat/src/config/model-params.ts).

### Pełny katalog (proxy worker)

- **Endpoint:** `GET /internal/solo-dev-chat/api/openrouter-models` + `X-Admin-Key`
- **Implementacja:** [`workers/chat/src/openrouter-catalog.ts`](../workers/chat/src/openrouter-catalog.ts) — `fetch https://openrouter.ai/api/v1/models` z `OPENROUTER_API_KEY`, cache **30 min** w pamięci workera
- **UI:** w Operator Studio wybór **Źródło modelu** → *Katalog OpenRouter* (wyszukiwarka + lista) lub *Preset (or_*)*
- **Czat:** przy katalogu panel wysyła `X-Epir-OpenRouter-Model: <slug>` (Bearer = klucz operatora); worker waliduje slug w cache katalogu i ustawia `modelCapabilities` (multimodal / `imageGen`)

### Recraft V4.1 (generacja obrazu / SVG)

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

Worker wysyła `modalities: ["image"]` dla modeli Recraft (`imageGen` w `model-params.ts`) — bez narzędzi MCP w tej turze. Odpowiedź może zawierać pole SSE `images` z data URL.

### Tekst (dodatkowo)

- `or_claude_sonnet_4` → `anthropic/claude-sonnet-4`
- `or_gpt41` → `openai/gpt-4.1`

## Tryby pracy (Operator Studio)

Lista **Tryb pracy** mapuje intencję na agent + model + sufiks promptu ([`workflow-presets.ts`](../workers/chat/src/solo-dev-ui/workflow-presets.ts)):

| ID trybu | Agent | Model (domyślny) | Oczekiwany wynik |
|----------|-------|------------------|------------------|
| `data_flow_audit` | `internal_analytics` | Groq default | Raport EDOG (flow-health); bez Q1–Q10 dopóki `edog_verdict` ≠ PASS |
| `data_warehouse` | `internal_analytics` | Groq default | Raport z `run_analytics_query` (Q1–Q10) |
| `data_marketing` | `internal_analytics` | Groq default | `fetch_marketing_preview` (GA4+Ads) |
| `data_shopify` | `internal_analytics` | Groq default | `run_shopify_shopifyql` (Admin, nie Storefront MCP) |
| `creative_trace` | `creative_image` | `or_recraft_v41_utility_vector` | Obraz pod trace / ryngraf |
| `creative_logo` | `creative_image` | `or_recraft_v41_pro_vector` | Obraz logo |
| `creative_icon_line` | `creative_image` | `or_recraft_v41_utility_vector` | Line icon |
| `creative_svg_code` | `creative_svg` | `or_claude_sonnet_4` | Kod `<svg>` w czacie |
| `creative_copy` | `creative_copy` | `or_gpt4o_mini` | Copy reklamowe |
| `production_blender` | `creative_blender_flow` | `or_gpt4o` | Kroki Blender (wykonanie: Blender MCP w Cursor) |
| `creative_gdocs_brief` | `creative_gdocs_brief` | `or_claude_sonnet_4` | Brief z Docs/Sheets (MCP `epir-gworkspace` w Cursor) |
| `storefront_hero` | `creative_storefront` | katalog OR (obraz) | Hero / baner sklepu |
| `storefront_landing_copy` | `creative_storefront` | katalog OR (tekst) | Copy landing page |
| `storefront_banner` | `creative_storefront` | katalog OR (obraz) | Baner promocyjny |

**Storefront MCP** (`/api/mcp` — katalog, koszyk, polityki dla Gemmy) **nie** jest panelem Recraft; Project B używa **Admin GraphQL / hurtowni / OpenRouter**.

## UI panelu (layout studio, wątek, załączniki)

- **Layout:** lewy panel (klucz, tryb, agent, model) · środek (baner trybu + wątek) · prawy panel (źródła, eksport D1, galeria sesji, profil operatora w `sessionStorage`).
- **Wątek:** `#thread` — wszystkie tury user/assistant; po odświeżeniu strony historia z `POST /internal/solo-dev-chat/api/history` (SessionDO).
- **Pobierz obraz:** przycisk pod każdą miniaturą wygenerowaną w bieżącej sesji; galeria po prawej (tylko do odświeżenia strony).
- **Załącznik:** jeden obraz na wiadomość (`image_base64` w body czatu), max **4 MB**, podgląd przed wysłaniem; wymaga modelu **multimodal** lub Recraft.
- **Enter** — wyślij; **Shift+Enter** — nowa linia w polu wiadomości.
- **Nowa rozmowa** — czyści `session_id` w `sessionStorage` (kolejna wiadomość = nowa sesja).
- Stare wiadomości z obrazem w historii API: tekst `(załącznik obrazu)` (miniatury z D1 nie są odtwarzane w v1).

## Workflow projektowy (operator)

1. **SVG / Flow** — agent `creative_svg` → eksport SVG → import w Blenderze (curve).
2. **Reklama** — `creative_copy` + `creative_image` (multimodal przy załączniku).
3. **Mesh** — `creative_blender_flow` + narzędzie `blender_bridge_invoke` (most HTTP, allowlist v1) lub fallback Blender MCP w Cursorze.

## Most Blender (Operator Studio ↔ Blender_assist)

- Materiał roboczy: [`EPIR_BLENDER_OPERATOR_STUDIO_BRIDGE.md`](EPIR_BLENDER_OPERATOR_STUDIO_BRIDGE.md)
- SSOT HTTP: [Blender_assist `docs/BLENDER_BRIDGE_HTTP.md`](https://github.com/EPIRjewelry/Blender_assist/blob/main/docs/BLENDER_BRIDGE_HTTP.md)
- **Sekrety:** `EPIR_OPERATOR_PANEL_SECRET` (Studio); var `BLENDER_BRIDGE_ORIGIN` (worker, bez ręcznej konfiguracji); relay PC bez hasła
- **Narzędzie czatu:** `blender_bridge_invoke` (tylko `internal-dashboard`)
- **UI:** panel „Most Blender” + `GET /internal/solo-dev-chat/api/blender-bridge-health`
