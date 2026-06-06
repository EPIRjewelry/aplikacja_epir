# Workers, Edge i Deploy EPIR

Moduł wiedzy dla Cloudflare Workers, ingressu, deployu, sekretów oraz ról ESOG, EFA, OQAG, Deploy, Indexer.

## Ingress i workers

**Online Store:** Shopify App Proxy `/apps/assistant/chat` — HMAC weryfikowany po stronie Chat Workera.

**Headless:** przeglądarka → BFF `/api/chat` → S2S `/chat` z `X-EPIR-SHARED-SECRET`, `X-EPIR-STOREFRONT-ID`, `X-EPIR-CHANNEL`.

**MUST NOT:** bezpośrednie wołanie `https://asystent.epirbizuteria.pl/chat` z przeglądarki; omijanie HMAC; sekrety w `apps/*` / `extensions/*`.

**Zasady workerów:**

- Logika AI, sekrety, D1, Vectorize, RPC — tylko w workerach.
- `storefrontId` + `channel` — pierwszoklasowy kontekst.
- Odczyt hurtowni: `run_analytics_query` (RPC `BIGQUERY_BATCH_RPC`, whitelist `queryId`) — nie surowe SQL od klienta.
- Deploy czatu: `workers/chat` → CF **`epir-art-jewellery-worker`**.

**Bindings (skrót):**

| Binding | Cel |
|---------|-----|
| `BIGQUERY_BATCH_RPC` | R2 SQL whitelist; `scopes: ["bigquery.analytics_query"]` |
| `ANALYTICS_S2S_RPC` | journey, sessions, charts |
| `ANALYTICS_WORKER` | proxy POST `/pixel*` |

Szczegóły: [`docs/EPIR_INGRESS_AND_RUNTIME.md`](../EPIR_INGRESS_AND_RUNTIME.md), [`docs/EPIR_DEPLOYMENT_AND_OPERATIONS.md`](../EPIR_DEPLOYMENT_AND_OPERATIONS.md).

## Governance sekretów

**ZABRONIONE:** nowe nazwy sekretów (`wrangler secret put`, Pages env, MCP env, `.env`) bez wyraźnej zgody operatora w sesji lub zatwierdzonym planie.

**Dozwolone bez dodatkowej zgody:**

- Worker→worker: service bindings + RPC (`*_RPC`).
- Operator: `EPIR_OPERATOR_PANEL_SECRET` (`X-Admin-Key`).
- Hydrogen BFF→czat: `EPIR_CHAT_SHARED_SECRET` (`X-EPIR-SHARED-SECRET`).
- Zewnętrzne API (Shopify, AI Gateway, OpenRouter, GA4/Ads, Pipelines/R2) — gdy dostawca wymaga.

**Zabronione bez zgody:** Cloudflare Access jako wymóg operatora; `SESSION_SECRET` na workerze czatu; dodatkowe klucze operatora na czacie/batch.

Audyt nazw (bez wartości): `node scripts/debug/cf-missing-secrets.mjs`

## Deploy

**Wymagania:** Node 18+, npm, Wrangler, Shopify CLI, `wrangler login`, `shopify app config link`.

**Kolejność (`deploy.ps1`):** npm ci → RAG → analytics → bigquery-batch → marketing-ingest → chat → shopify app build → shopify app deploy.

**Tylko workers:** `.\deploy-workers.ps1` (bez npm ci / Shopify).

**Faza 0 (pierwszy deploy):**

```powershell
cd d:\aplikacja_epir
shopify app config link
# Migracje D1 (chat, bigquery-batch) — wrangler d1 migrations apply --remote
# Sekrety — wrangler secret put (po zgodzie operatora)
```

**Hydrogen Pages:**

```powershell
cd apps/kazka && npm run build && wrangler pages deploy public --project-name=kazka-hydrogen-pages
cd apps/zareczyny && npm run build && wrangler pages deploy public --project-name=zareczyny-hydrogen-pages
```

**Weryfikacja post-deploy:**

- `https://asystent.epirbizuteria.pl/chat` — odpowiada
- `https://asystent.epirbizuteria.pl/pixel` — POST ok
- Partners → Extensions widoczne; App Proxy `/apps/assistant/*` skonfigurowany

**D1 IDs (skonfigurowane):** jewelry-analytics-db `6a4f7cbb-...`; ai-assistant-sessions-db `475a1cb7-...`

## ESOG (Shopify Orthodoxy Guardian)

**Rola:** recenzja architektury/kodu — **nie naprawia kodu**.

**Werdykty:** Compliant | Partially | Non-compliant | Needs design. Priorytety: MUST / SHOULD / NICE-TO-HAVE.

**Bramka warehouse:** `ESOG: PASS` | `ESOG: FAIL` — razem z `EDCG: PASS` na tym samym kroku.

**Pilnuje:** apps vs frontend, sekrety/HMAC, `storefrontId`/`channel`, pamięć czatu, kazka/zareczyny, RAG `metadata.storefront`.

## EFA (Fix Agent)

**Rola:** mechaniczne wdrożenie poprawek po werdyktach ESOG — patche w TS/JS/TSX/CSS/Liquid, `wrangler.toml`, migracje D1, docs.

**Nie robi:** nowej architektury, nowych endpointów MCP bez specyfikacji, nowych scope Admin API bez potrzeby, feature'ów marketingowych od zera.

**Workflow:** zrozum problem → ESOG werdykt → zidentyfikuj pliki → patch → sprawdź orthodoksję → raport (opis, pliki, diff, uwagi migracji).

## OQAG (OpenRouter Quality Gate — Project B)

**Rola:** jakość integracji OpenRouter w `epir-marketing-agent-service` / `epir_analityc`. **Nie naprawia kodu.**

**Źródła:** plan integracji OpenRouter, [`EPIR_AI_ECOSYSTEM_MASTER.md`](../../EPIR_AI_ECOSYSTEM_MASTER.md), [`docs/EPIR_CLOUDFLARE_AGENT_SERVICE_PLAN.md`](../EPIR_CLOUDFLARE_AGENT_SERVICE_PLAN.md), kod w `epir-marketing-agent-service/`.

**Werdykt:** `OQAG: PASS` | `OQAG: FAIL` na każdy krok planu. MUST niespełnione → FAIL.

**Kryteria (skrót):** brak hardcode API key; sekrety w Wrangler; wrapper OpenRouter z `ModelId`; testy vitest; brak regresji starych metod.

## Indexer (dokumentacja lokalna)

- `tools/index_docs.py` → `data/embeddings.json` (gitignored).
- Opcjonalnie Qdrant: `--backend qdrant`.
- CLI: `python agents/indexer_agent/run_agent.py`
- **Nie** traktuj embeddings jako prawdy nad Bible/Master; nie commituj `data/embeddings.json`.

## Project A vs Project B

| Project | Zakres |
|---------|--------|
| **A** | Buyer-facing: Theme Extension, Hydrogen, Gemma — pełne guardrails ingressu |
| **B** | Wewnętrzne: BigQuery, dashboardy, OpenRouter, operacje serwerowe — **nie** rozszerzać wyjątków B na A |
