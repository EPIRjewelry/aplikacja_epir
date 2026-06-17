# Bramka ESOG — Operator Studio v2

Każdy krok wymaga werdyktu **`ESOG: PASS`** przed rozpoczęciem następnego.

## Zasady nienegocjowalne (cały projekt v2)

| # | Kryterium | PASS jeśli |
|---|-----------|------------|
| G.1 | Brak nowych workerów | Zmiany tylko w `workers/chat` + `apps/operator-studio` (frontend) |
| G.2 | Brak nowych nazw sekretów | Tylko istniejące: `EPIR_OPERATOR_PANEL_SECRET`, `OPENROUTER_API_KEY`, `SHOPIFY_ADMIN_TOKEN`, `AI_GATEWAY_TOKEN`; var `BLENDER_BRIDGE_ORIGIN` |
| G.3 | Bindingi RPC | `BIGQUERY_BATCH_RPC`, `STORE_STEWARD_RPC`, `MARKETING_INGEST_RPC`, `SESSION_DO`, `DB_CHATBOT` — bez nowych bindingów sekretów |
| G.4 | Oddzielenie od Gemmy | Kanał `operator` bez `get_cart`/`update_cart`, bez AI Profile metaobjectu, bez pamięci kupującego |
| G.5 | Project A nietknięty | `channel: online-store` / App Proxy bez regresji w testach |

## Krok 1 — Kanał `operator` + allowlista

| # | Kryterium |
|---|-----------|
| 1.1 | `OPERATOR_CHANNEL = 'operator'` w `workers/chat/src/operator/` |
| 1.2 | `OPERATOR_TOOL_ALLOWLIST` — jawna lista; brak `get_cart`, `update_cart`, `get_size_table` |
| 1.3 | `streamAssistant` pomija buyer context gdy `channel === 'operator'` |
| 1.4 | Kanał `operator` — jedyny ingress Project B w Studiu |

## Krok 2 — API raportów

| # | Kryterium |
|---|-----------|
| 2.1 | `GET …/api/reports` i `GET …/api/reports/:date` — tylko odczyt D1 |
| 2.2 | Ścieżki API pod `/internal/operator-studio/api/*` |

## Krok 3 — Role operatora

| # | Kryterium |
|---|-----------|
| 3.1 | 4 role: `analyst`, `store_ops`, `design_blender`, `creative` |
| 3.2 | Nagłówek `X-EPIR-OPERATOR-ROLE` |

## Krok 4–5 — UI React

| # | Kryterium |
|---|-----------|
| 4.1 | `apps/operator-studio` — nie worker |
| 4.2 | Build → `workers/chat/operator-studio-dist`; serwowanie z workera czatu |
| 4.3 | Pełny katalog OpenRouter w UI |

## Krok 6 — Admin Shopify (faza 2)

| # | Kryterium |
|---|-----------|
| 6.1 | `operator_shopify_admin_read` — whitelist presetów GraphQL |
| 6.2 | `SHOPIFY_ADMIN_TOKEN` istniejący — bez nowej nazwy sekretu |

## Werdykty (uzupełnia implementator po każdym kroku)

```text
Krok 0: ESOG: PASS — checklist utworzony
Krok 1: ESOG: PASS — kanał operator + allowlista w workers/chat
Krok 2: ESOG: PASS — API raportów + aliasy ścieżek
Krok 3: ESOG: PASS — 4 role + X-EPIR-OPERATOR-ROLE
Krok 4–5: ESOG: PASS — apps/operator-studio + assets binding
Krok 6: ESOG: PASS — operator_shopify_admin_read whitelist
Krok 7: oczekuje — vitest lokalny; deploy/commit ręczny operatora
```
