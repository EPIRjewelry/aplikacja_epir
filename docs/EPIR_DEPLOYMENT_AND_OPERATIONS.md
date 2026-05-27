# EPIR Deployment and Operations

## Cel

Ten dokument scala w jednym miejscu wymagania operacyjne: sekrety, migracje, kolejność deployu, Pages i podstawową checklistę weryfikacji.

## Zakres środowiska

Komponenty objęte tym dokumentem:

- `workers/chat`
- `workers/rag-worker`
- `workers/analytics`
- `workers/bigquery-batch`
- `workers/analyst-worker`
- `apps/kazka`
- `apps/zareczyny`
- aplikacja Shopify `epir_ai`

## Wymagania wstępne

- działający dostęp do Cloudflare (`wrangler login` lub token API),
- Shopify CLI powiązany z właściwą aplikacją i sklepem,
- Node.js / npm zgodne z projektem,
- uprawnienia do ustawiania secrets i deployu workers / pages.

## Sekrety i konfiguracja

### Profile środowisk `staging` / `production` w `wrangler.toml` (workery backendowe)

Aktualny stan repo dla m.in.:

- `workers/chat/wrangler.toml`
- `workers/rag-worker/wrangler.toml`
- `workers/analytics/wrangler.toml`
- `workers/bigquery-batch/wrangler.toml`
- `workers/analyst-worker/wrangler.toml`

Każdy plik definiuje sekcje `[env.staging]` i `[env.production]` jako profile dziedziczące konfigurację top-level (bindingi, sekrety, triggery/routy), bez jawnych override'ów w samych sekcjach env.

Kontrakt operacyjny:

- środowisko jest rozróżniane nazwą profilu (`--env staging` / `--env production`) oraz sekretami i ustawieniami utrzymywanymi po stronie Cloudflare,
- brak override w `[env.*]` jest intencjonalny; nie traktujemy tego jako brak konfiguracji,
- wszelkie różnice między staging i production dodajemy tylko wtedy, gdy są wymagane i jawnie uzasadnione release'em.

Wymóg polityki deploy:

- `workers_dev` nie może być `true` w root ani w `[env.production]` dla workerów **wpisanych w** `scripts/ci/validate-wrangler-prod-policy.py` (m.in. chat, rag, analytics, bigquery-batch, marketing-ingest). Inne workery (np. `workers/analyst-worker` z publicznym `*.workers.dev`) mogą mieć inną posturę — o ile jest to jawne w `wrangler.toml` i w tym dokumencie.

### `workers/chat`

Wymagane sekrety backendowe:

- `AI_GATEWAY_TOKEN` (nagłówek `cf-aig-authorization` do AI Gateway; model Groq idzie przez gateway, nie przez `Authorization: Bearer` z kluczem Groq)
- `SHOPIFY_APP_SECRET`
- `EPIR_CHAT_SHARED_SECRET`
- `EPIR_OPERATOR_PANEL_SECRET` (powierzchnie HTTP panelu: `X-Admin-Key`, `Bearer` przy `X-Epir-Model-Variant`; odrębnie od S2S czatu `EPIR_CHAT_SHARED_SECRET` oraz od RPC `BIGQUERY_BATCH_RPC`, gdzie gateway przekazuje `ctx.props.scopes` na binding)
- **Prywatny Dev-asystent (jeden operator):** po deployu `workers/chat` otwórz w przeglądarce `GET https://<host workera czatu>/internal/solo-dev-chat` (ten sam host co BFF `/chat`, np. produkcyjny worker). UI może trzymać `EPIR_OPERATOR_PANEL_SECRET` w `sessionStorage` tej przeglądarki i wołać `POST /internal/solo-dev-chat/api/chat` — worker **sam** dokleja S2S (`EPIR_CHAT_SHARED_SECRET`) oraz kanał `internal-dashboard` (agent analityczno-doradczy wewnętrzny). Lista modeli w UI odpowiada nagłówkowi `X-Epir-Model-Variant` (domyślnie Groq GPT-OSS-120B przez AI Gateway; alternatywy Workers AI, np. Kimi; warianty `or_*` wymagają sekretu **`OPENROUTER_API_KEY`** na `epir-art-jewellery-worker`). **Produkcja:** przed publicznym hostem ustaw **Cloudflare Access** (lub ruch wyłącznie przez VPN / tunel) — sekret operatora zostaje w Cloudflare Secrets; Access decyduje, kto w ogóle może załadować stronę i wywołać API (najlepsze dopięcie do „sekret tylko w Secrets”).
- tokeny storefrontów używane przez worker, zależnie od konfiguracji:
  - `SHOPIFY_STOREFRONT_TOKEN`
  - `PUBLIC_STOREFRONT_API_TOKEN_KAZKA`
  - `PUBLIC_STOREFRONT_API_TOKEN_ZARECZYNY`
  - `PRIVATE_STOREFRONT_API_TOKEN_ZARECZYNY`

**Wersje Shopify API w kodzie workera czatu:** Storefront GraphQL jest pinowany na **`2024-10`** (`SHOPIFY_STOREFRONT_API_VERSION` w [`workers/chat/src/config/shopify-api-version.ts`](../../workers/chat/src/config/shopify-api-version.ts)); Admin GraphQL (w tym `shopifyqlQuery` dla `run_shopify_shopifyql`) na **`2026-04`**, zgodnie z `[webhooks] api_version` w [`shopify.app.toml`](../../shopify.app.toml). **Storefront nie jest automatycznie podbijany razem z Admin** — osobna decyzja i retest metaobjectów / tabeli rozmiarów / AI profile. **Podbicie wersji Admin:** w jednym PR zmień `shopify.app.toml` (`[webhooks] api_version`) oraz `SHOPIFY_ADMIN_API_VERSION` w `shopify-api-version.ts`; przed merge uruchom `python3 scripts/ci/validate-shopify-admin-api-version.py` (ten sam krok jest w workflow **Deploy safety policy** na PR).

#### Wybór tokenu Storefront dla Online Store / TAE

`SHOPIFY_STOREFRONT_TOKEN` nie jest osobnym "typem tokenu TAE". To ten sam typ Storefront API access tokenu, którego używa Headless/Hydrogen. Operacyjnie:

- opcja A: użyj tego samego tokenu co storefront headless (najprostsza konfiguracja),
- opcja B: użyj osobnego tokenu z aplikacji obsługującej ścieżkę chat/TAE (lepsza separacja i rotacja).

Niezależnie od opcji:

- token musi dotyczyć tego samego sklepu co `SHOP_DOMAIN`,
- token musi mieć scope'y wymagane przez worker (minimum odczyt metaobjectów dla AI profile),
- token musi być ustawiony w Cloudflare jako secret `SHOPIFY_STOREFRONT_TOKEN`.

### `workers/rag-worker`

Wymagane elementy operacyjne:

- binding `VECTOR_INDEX`
- binding `AI`
- `CANONICAL_MCP_URL`
- `SHOP_DOMAIN`
- `ADMIN_TOKEN` ustawiony bezpiecznie poza placeholderem z repo

Dodatkowe wymaganie bezpieczeństwa:

- endpoint `POST /admin/upsert` działa w modelu fail-closed: brak secretu `ADMIN_TOKEN`, placeholder lub niepoprawny token żądania musi zwracać `401`.

### `workers/bigquery-batch`

**Eksport nocny (D1 → Pipelines / Iceberg)** — wymaga co najmniej jednego URL ingest:

- `PIPELINE_PIXEL_INGEST_URL` — HTTP ingest dla strumienia zdarzeń pixel
- `PIPELINE_MESSAGES_INGEST_URL` — HTTP ingest dla strumienia wiadomości czatu
- `PIPELINE_INGEST_TOKEN` — opcjonalny Bearer, jeśli ingest wymaga autoryzacji

**Schematy streamów Pipelines** (zgodne z kształtem JSON z batcha): [`specs/schemas/`](../specs/schemas/) — pliki `*.schema.json`; komendy Wrangler: [`workers/bigquery-batch/pipelines-schemas/README.md`](../workers/bigquery-batch/pipelines-schemas/README.md).

**`run_analytics_query` (Workers RPC)** — **R2 SQL** nad Iceberg:

- `R2_SQL_ACCOUNT_ID`, `R2_SQL_WAREHOUSE_BUCKET` — `[vars]` w `wrangler.toml`
- `R2_SQL_API_TOKEN` — `wrangler secret put R2_SQL_API_TOKEN`
- opcjonalnie: `WAREHOUSE_SQL_NAMESPACE`, `WAREHOUSE_SQL_PIXEL_TABLE`, `WAREHOUSE_SQL_MESSAGES_TABLE`

Google BigQuery **nie** jest używane przez ten worker (ani eksport, ani odczyty whitelisty).

Cron eksportu uruchamia się tylko przy skonfigurowanym **co najmniej jednym** z URLi Pipelines powyżej.

Postura ingress dla produkcji:

- `workers_dev = false` (brak publicznej domeny developerskiej dla workera batch),
- `run_analytics_query` realizowane przez **Workers RPC** (`BIGQUERY_BATCH_RPC` → `BigQueryBatchS2SRpc`, `ctx.props`); ścieżka HTTP `POST /internal/analytics/query` pozostaje celowo zamknięta (`404`).

**EDOG (operacyjny przepływ danych):**

- `wrangler secret put DATA_GUARDIAN_OPS_KEY` — Bearer do `GET /internal/flow-health` (oraz MCP lokalnego `epir-data-ops`).
- Cron monitoringu: `0 8 * * *` i `0 20 * * *` UTC (osobno od eksportu `0 2 * * *`).
- Opcjonalnie KV raportu: `wrangler kv namespace create epir-data-guardian` → odkomentuj `DATA_GUARDIAN_KV` w `workers/bigquery-batch/wrangler.toml`.
- Smoke po deploy: [`scripts/smoke-flow-health.ps1`](../scripts/smoke-flow-health.ps1) lub [`scripts/smoke-flow-health.sh`](../scripts/smoke-flow-health.sh) z env `DATA_GUARDIAN_OPS_KEY`, `EPIR_BATCH_WORKER_ORIGIN`.
- Na `epir-art-jewellery-worker`: RPC `getFlowHealth` (dla Operator Studio / audytu). Twarda bramka przed `run_analytics_query` tylko przy `EDOG_GATE_ENABLED=true` (domyślnie wyłączona).

### Cursor IDE i Cloud — MCP (nie deploy workera)

Skopiuj szablon [`.cursor/mcp-epir.example.json`](../.cursor/mcp-epir.example.json) do **`.cursor/mcp.json`** (lokalnie i w środowisku Cursor Cloud — te same env).

| Serwer MCP | Pakiet | Wymagane env |
|------------|--------|----------------|
| `epir-data-ops` | `mcp-servers/epir-data-ops` | `CLOUDFLARE_ACCOUNT_ID`, `CLOUDFLARE_API_TOKEN` (D1 Read), `EPIR_BATCH_WORKER_ORIGIN`, `DATA_GUARDIAN_OPS_KEY` |
| `epir-gworkspace` | `mcp-servers/gworkspace` | OAuth client id/secret; `npm run auth` w pakiecie |

Integracje **poza repo** (włączasz w Cursor): Shopify Admin MCP, Shopify Dev MCP, Cloudflare plugin MCP, Blender MCP — patrz [`docs/EPIR_WORKSPACE_MAP.md`](EPIR_WORKSPACE_MAP.md) i [`docs/CURSOR_CLOUD_AGENT_SETUP.md`](CURSOR_CLOUD_AGENT_SETUP.md).

**Nie commituj** `.cursor/mcp.json` ani tokenów.

### `workers/store-steward` (`epir-store-steward`)

Faza 0 Store Steward — agregacja `pixel_events` + wnioski w D1 (`jewelry-analytics-db`). **Brak sekretów HTTP** na tym workerze; odczyt/zapis przez **RPC** `StoreStewardS2SRpc` (tylko service binding); zewnątrz — `epir-analyst-worker` + `ANALYST_HTTP_BEARER`.

- Cron: `0 4 * * *` UTC
- Wołający zewnętrzny (Cursor): **`epir-analyst-worker`** — `GET|POST /v1/steward/*` + Bearer **`ANALYST_HTTP_BEARER`** (proxy RPC, bez `EPIR_CHAT_SHARED_SECRET` na store-steward)
- Kanon: [`EPIR_STORE_STEWARD.md`](EPIR_STORE_STEWARD.md)

### `workers/analyst-worker` (`epir-analyst-worker`)

Cienki worker **HTTP + Bearer** (np. narzędzia w Cursorze): `POST /v1/warehouse/query` z JSON `{ "queryId": "…" }` — **bez surowego SQL**; whitelist `queryId` jest współdzielona z batch workerem (`workers/bigquery-batch/src/analytics-query-ids.ts`). Wywołanie idzie przez binding **`BIGQUERY_BATCH_RPC`** → `runAnalyticsQuery` (ten sam kontrakt co czat).

**Sekrety:** `ANALYST_HTTP_BEARER` — `wrangler secret put ANALYST_HTTP_BEARER --env=""` z katalogu `workers/analyst-worker` (wartość tylko w vault). Ten sam Bearer obsługuje `POST /v1/warehouse/query` oraz **Store Steward** (`/v1/steward/aggregate`, `/v1/steward/insights`, `/v1/steward/reports`) przez RPC do `epir-store-steward`.

**Bindingi RPC:** `BIGQUERY_BATCH_RPC`, `STORE_STEWARD_RPC` — każdy z `[services.props] scopes` jak w `workers/analyst-worker/wrangler.toml`; deploy **po** `store-steward` i `bigquery-batch`.

**Vars (nie-sekret)** — `[vars]` w `wrangler.toml` lub Dashboard:

- `ANALYST_EXPOSE_VALID_QUERY_IDS` — domyślnie `false`; ustaw `true` tylko lokalnie / debug, jeśli w odpowiedzi `400` dla złego `queryId` mają wrócić enumerowane ID (w prod zostaw `false`, żeby nie ujawniać schematu przy wycieku Bearer).
- `ANALYST_RATE_LIMIT_MAX` (opcjonalnie, domyślnie `60`) — max liczba żądań `POST /v1/warehouse/query` na adres (`CF-Connecting-IP`, inaczej `unknown`) w oknie czasu.
- `ANALYST_RATE_LIMIT_WINDOW_MS` (opcjonalnie, domyślnie `60000`) — długość okna w ms. Przekroczenie ⇒ `429` + `Retry-After` (limit best-effort per izolat Workers; przy bardzo dużym ruchu rozważ WAF / produkt Rate Limiting po stronie Cloudflare).

**Kontrakt HTTP:** nagłówek `Content-Type` musi zawierać `application/json` (np. `application/json; charset=utf-8`); inaczej `415`.

**Plan utrzymania (import whitelisty):** lista `queryId` żyje w `workers/bigquery-batch/src/analytics-query-ids.ts`; `epir-analyst-worker` importuje ten plik względną ścieżką w monorepo — jedna prawda, brak SQL w bundlu analysta; koszt to zależność build/deploy między workerami (przy jednym maintainerze zwykle OK; przy rozroście zespołu rozważ wydzielenie `packages/…` z samym eksportem ID).

**Deploy:** po `workers/bigquery-batch` (usługa docelowa RPC musi istnieć). W repo: krok `[4/6]` w `deploy-workers.ps1` / `[5/9]` w `deploy.ps1`.

**Postura:** w `wrangler.toml` root **`workers_dev = true`** — worker ma publiczny URL `*.workers.dev`; dostęp do zapytań magazynowych wyłącznie przy poprawnym Bearerze i whitelistowanym `queryId`.

### `workers/marketing-ingest` (`epir-marketing-ingest`)

Osobny worker od `workers/bigquery-batch`: **pull** GA4 (Data API) + Google Ads (GAQL), zapis **agregatów** do Cloudflare Pipelines (HTTP ingest) → Iceberg w **tym samym** buckecie co hurtownia pixeli (`MARKETING_ICEBERG_BUCKET`, domyślnie `epir-analytics-iceberg-warehouse`), logiczny namespace docelowy **`marketing`** (`MARKETING_SQL_NAMESPACE`). Brak mieszania z eksportem D1 → Iceberg z batcha.

**Konfiguracja połączeń GA4 + Google Ads** (service account, OAuth refresh, developer token, `wrangler secret put`): [`workers/marketing-ingest/README.md`](../workers/marketing-ingest/README.md).

**Smoke eksportu D1 → Pipelines (operator):** po deployu `epir-bigquery-batch` — `POST /internal/trigger-export` z `Authorization: Bearer <DATA_GUARDIAN_OPS_KEY>` (ten sam secret co `GET /internal/flow-health`) albo ręczne odpalenie crona w Dashboard. Odpowiedź JSON zawiera `batch_exports`; w D1 `last_pixel_export_at` powinno rosnąć, gdy ingest HTTP akceptuje batche. Jeśli w logach `[WAREHOUSE_BATCH] pipeline_chunk_failed` — ustaw `PIPELINE_INGEST_TOKEN` (Pipelines HTTP auth).

**Sekrety** (`wrangler secret put` w katalogu workera):

- `MARKETING_PIPELINE_INGEST_URL` — URL HTTP ingest z `npx wrangler pipelines setup` (wartość tylko w vault / sekretach),
- opcjonalnie `MARKETING_PIPELINE_INGEST_TOKEN` — nagłówek `Authorization: Bearer …` przy ingest,
- `GA4_SERVICE_ACCOUNT_JSON` — pełny JSON konta usługi z dostępem do GA4 (scope aplikacji: read-only Analytics),
- Google Ads: `GOOGLE_ADS_CLIENT_SECRET`, `GOOGLE_ADS_REFRESH_TOKEN`, `GOOGLE_ADS_DEVELOPER_TOKEN`.

**Vars (nie-sekret)** — Dashboard Cloudflare albo `[vars]` / `wrangler vars`: `GA4_PROPERTY_ID` (np. `properties/123` lub sam numeryczny id), `GOOGLE_ADS_CLIENT_ID`, `GOOGLE_ADS_CUSTOMER_ID` (bez myślników).

**Cron:** `0 */6 * * *` (UTC) — patrz `workers/marketing-ingest/wrangler.toml`. Publicznie: `GET /`, `GET /healthz`. Z `workers_dev = true` worker ma też URL **`*.workers.dev`** (użyteczne do `GET /ops/marketing-preview`). Opcjonalnie **`GET /ops/marketing-preview`** — podgląd JSON (GA4 + Google Ads, bez ingestu), tylko gdy ustawisz sekret `MARKETING_OPS_PREVIEW_KEY` i nagłówek `Authorization: Bearer …`; bez sekretu ścieżka zwraca `404`.

**Stanowy asystent analityk (Durable Object, bez dodatkowego workera):** przy tym samym sekrecie `MARKETING_OPS_PREVIEW_KEY` — `POST /ops/marketing-analyst/{instance}/refresh` (opcjonalne body JSON `{"date":"YYYY-MM-DD"}`) wywołuje tę samą logikę co preview, zapisuje skrót w DO i zwraca pełny JSON podglądu; `GET /ops/marketing-analyst/{instance}/state` zwraca ostatni skrót. Pakiet npm `agents` **nie** jest użyty (konflikt `zod` w bundlu monorepo z Wrangler/Shopify); możliwa późniejsza migracja na Cloudflare Agents SDK po ustabilizowaniu zależności.

**Pipelines (jednorazowo, operatorsko):**

1. `cd workers/marketing-ingest` (lub root z zalogowanym `wrangler login`).
2. `npx wrangler pipelines setup` — utwórz pipeline / stream HTTP zgodnie z aktualną dokumentacją Cloudflare; nazwa operacyjna np. `epir-marketing-ingest`.
3. W UI Pipelines ustaw **pole rekordu** zgodnie z kształtem `MarketingStreamRecord` w [`workers/marketing-ingest/src/schema.ts`](../workers/marketing-ingest/src/schema.ts) (`source`, `date`, `campaign_id`, `campaign_name`, `session_source`, `metric_*`).
4. Docelowe tabele Iceberg (np. `marketing.marketing_daily`) definiuje **SQL transform** stream → sink; szkic: [`workers/marketing-ingest/pipeline-transform.example.sql`](../workers/marketing-ingest/pipeline-transform.example.sql).

**Smoke (operatorsko, bez commitowania tokenów):**

1. `curl -X POST -H "Content-Type: application/json" --data-binary @- "$MARKETING_PIPELINE_INGEST_URL" <<'EOF'
[{"source":"google_analytics","date":"2026-05-13","campaign_id":null,"campaign_name":"(direct)","session_source":"google","metric_sessions":1,"metric_conversions":0,"metric_revenue":0,"metric_impressions":null,"metric_clicks":null,"metric_cost":null}]
EOF`
2. Kontrola odczytu (dopiero po propagacji Iceberg / Data Catalog), z konta z tokenem R2 SQL: `wrangler r2 sql query <WAREHOUSE> --database <CATALOG> --command="SELECT * FROM marketing.marketing_daily LIMIT 5;"` (dostosuj `WAREHOUSE`, `CATALOG` i nazwę tabeli do konfiguracji pipeline’u).

### `workers/analytics`

Wymagane sekrety backendowe:

- `SHOPIFY_WEBHOOK_SECRET`

Postura ingress dla produkcji:

- publiczne `GET /pixel/events`, `GET /journey`, `GET /sessions`, `GET /internal/warehouse/charts` zwracają `404` (brak odczytów przez surowy HTTP); gateway czatu dla tych funkcji wywołuje **`ANALYTICS_S2S_RPC`** (`AnalyticsS2SRpc`) z `props` zakresów.

### Kontrakt service binding (chat -> analytics / warehouse)

- Gateway HTTP: **`ANALYTICS_WORKER`** (np. ingest `POST /pixel*`),
- chronione odczyty: **`ANALYTICS_S2S_RPC`** (RPC),
- zapytania whitelist `run_analytics_query` (R2 SQL): **`BIGQUERY_BATCH_RPC`** (RPC; nazwa bindingu historyczna).
- Nie utrzymujemy fallbacków do publicznych adresów `*.workers.dev` dla ruchu internal.

**Troubleshooting: `rpc:forbidden missing scope bigquery.analytics_query`**

- To **nie** jest brak uprawnień GCP BigQuery — to brak (lub pustej) tablicy **`ctx.props.scopes`** po stronie workera **`epir-bigquery-batch`** przy wywołaniu RPC `runAnalyticsQuery`.
- **Caller** (`epir-art-jewellery-worker` / `epir-analyst-worker`) musi w `wrangler.toml` mieć pod bindingiem `BIGQUERY_BATCH_RPC` blok **`[services.props]`** z `scopes = ["bigquery.analytics_query"]` (jak w repo). Repo waliduje to w **`scripts/ci/validate-wrangler-prod-policy.py`** (`rpc_props_scopes`).
- **Naprawa:** wdróż ponownie workera **wołającego** (`workers/chat` i/lub `workers/analyst-worker`): `npx wrangler deploy` z odpowiedniego katalogu — tak jak w [`.github/workflows/deploy.yml`](../.github/workflows/deploy.yml) (najpierw `bigquery-batch`, potem `analyst-worker`, potem `chat`). Jeśli binding był kiedyś składany ręcznie w Dashboardzie bez `props`, nadpisz go deployem z TOML z repo.
- **Lokalnie:** `ctx.props` z service bindingów nie zawsze działa przy **wielu osobnych** `wrangler dev`; użyj [multi-worker dev](https://developers.cloudflare.com/workers/development-testing/multi-workers/) (`wrangler dev -c ./workers/chat/wrangler.toml -c ./workers/bigquery-batch/wrangler.toml` itd.) albo testuj RPC na wdrożonym środowisku.

**Troubleshooting: R2 SQL — brak kolumny `payload` / `url` w `analytics.epir_pixel_events_raw`**

- Batch HTTP ingest nadal wysyła `url` + `payload` (zob. [`workers/bigquery-batch/src/index.ts`](../workers/bigquery-batch/src/index.ts) i [`specs/schemas/pixel-events-stream.schema.json`](../specs/schemas/pixel-events-stream.schema.json)), ale **produkcyjna** tabela Iceberg ma układ **spłaszczony** (np. `page_url`, `referrer_url`, `id`, `__ingest_ts`) — mapowanie robi **SQL pipeline’u** w Cloudflare (Dashboard / `wrangler pipelines get`), nie repo.
- Whitelist `run_analytics_query` w [`workers/bigquery-batch/src/analytics-queries.ts`](../workers/bigquery-batch/src/analytics-queries.ts) musi odwoływać się do kolumn Iceberg (`page_url`, nie `url`; bez `json_get_str(payload, …)`). Po zmianie presetów: `wrangler deploy` z `workers/bigquery-batch`, potem `workers/chat`.
- Weryfikacja operatorska: `wrangler r2 sql query … --command "DESCRIBE analytics.epir_pixel_events_raw"` (dostosuj katalog/bucket) i porównaj z presetami Q1–Q10. **Q1** nie używa `payload`; typowe błędy dotyczą **Q4** (`page_url`) i **Q5** (agregacja po `page_url`).

**Troubleshooting: R2 SQL — `SELECT DISTINCT is not supported` / `COUNT(DISTINCT …)`**

- Silnik **R2 SQL** nie obsługuje `SELECT DISTINCT` ani agregatu `COUNT(DISTINCT col)` — patrz [ograniczenia R2 SQL](https://developers.cloudflare.com/r2-sql/reference/limitations-best-practices/). Presety w [`workers/bigquery-batch/src/analytics-queries.ts`](../workers/bigquery-batch/src/analytics-queries.ts) muszą używać `GROUP BY` oraz `approx_distinct()` (jak CQRS w `workers/analytics/src/cqrs/r2-warehouse-query.ts`).
- Po zmianie presetów: `wrangler deploy` z `workers/bigquery-batch`, potem retest `Q1_CONVERSION_CHAT` w internal-dashboard.

### Cloudflare Pages (`kazka`, `zareczyny`)

W zależności od storefrontu i runtime:

- `SESSION_SECRET`
- `PUBLIC_STOREFRONT_API_TOKEN`
- `PRIVATE_STOREFRONT_API_TOKEN` (gdzie wymagany)
- `PUBLIC_CUSTOMER_ACCOUNT_API_CLIENT_ID`
- `EPIR_CHAT_SHARED_SECRET`

## Bazy D1

### `ai-assistant-sessions-db`

Rola:

- wiadomości,
- profile klientów,
- pamięć pomocnicza,
- dane pomocnicze chat runtime,
- **Consent Gate:** tabela append-only `consent_events` (migracja `workers/chat/migrations/005_consent_events.sql`).

### `jewelry-analytics-db`

Rola:

- eventy analityczne,
- logi eksportów,
- storage dla analytics pipeline.

## Kolejność migracji

1. `workers/chat` → `ai-assistant-sessions-db` (w tym **`005_consent_events.sql`** dla `consent_events`, jeśli jeszcze nie zastosowano na danej bazie)
2. `workers/bigquery-batch` → `jewelry-analytics-db`

Wykonuj migracje przed pierwszym pełnym deployem i później wyłącznie wtedy, gdy pojawiają się nowe pliki migracyjne.

Przykład (remote): `wrangler d1 execute ai-assistant-sessions-db --remote --file=./migrations/005_consent_events.sql` z katalogu `workers/chat` (dostosuj środowisko do polityki release).

## Kolejność deployu

### 1. Shopify link

Najpierw powiąż repo z właściwą aplikacją Shopify i sklepem developerskim / docelowym, jeśli nie jest jeszcze podpięte.

### 2. Migracje D1

Zastosuj migracje dla chatu i batch exportu.

### 3. Sekrety

Ustaw wszystkie sekrety dla workerów i Pages przed deployem.

### 4. Deploy workerów

Kolejność zalecana:

1. `workers/rag-worker`
2. `workers/analytics`
3. `workers/bigquery-batch`
4. `workers/analyst-worker` (RPC do `epir-bigquery-batch`; wymaga wcześniejszego deployu batch)
5. `workers/marketing-ingest`
6. `workers/chat` (**musi obejmować trasy Consent Gate:** `POST /apps/assistant/consent`, `POST /consent` oraz zapis do `consent_events` po zastosowaniu migracji D1)

W praktyce `deploy.ps1` powinien utrzymywać tę kolejność. Aby wdrożyć **wyłącznie** te sześć workerów bez `npm ci` i bez kroku Shopify, użyj `deploy-workers.ps1` w katalogu głównym repo.

### 5. Deploy aplikacji Shopify

Po workerach uruchom build i deploy aplikacji Shopify, aby zsynchronizować extensions (w tym **Theme App Extension** `asystent-klienta` z Consent Gate w assetach) i konfigurację App Proxy.

### 6. Deploy storefrontów headless

Zbuduj i wdroż:

- `apps/kazka`
- `apps/zareczyny`

na Cloudflare Pages (**obie aplikacje muszą zawierać trasy `api.consent.ts` i sekret `EPIR_CHAT_SHARED_SECRET` jak dla `/api/chat`**).

### Kolejność końcowa produkcji (Consent Gate — skrót)

1. **Migracja D1:** `005_consent_events.sql` na bazę `ai-assistant-sessions-db` (przed lub w ramach release workera `chat`).
2. **Sekrety:** m.in. `EPIR_CHAT_SHARED_SECRET` w Cloudflare Pages (`kazka`, `zareczyny`) oraz sekrety workera `chat` (bez zmiany listy względem czatu).
3. **Deploy workerów** — w szczególności **`workers/chat`** po migracji (trasy `/apps/assistant/consent`, `/consent`).
4. **Deploy aplikacji Shopify** (`shopify app deploy` / proces kanoniczny repo): **TAE** + App Proxy zsynchronizowane z workerem.
5. **Deploy Cloudflare Pages:** `kazka`, `zareczyny` (trasy `api.consent` + pozostały BFF czatu).

## Weryfikacja po deployu

### Worker i ingress

Sprawdź:

- `https://asystent.epirbizuteria.pl/chat`
- konfigurację App Proxy `.../apps/assistant/*`
- poprawność HMAC dla Online Store
- poprawność S2S dla `/api/chat` w `kazka` i `zareczyny`

### RAG

Sprawdź:

- health `workers/rag-worker`,
- dostępność bindingów,
- czy retrieval działa dla policy / product flows,
- czy `ADMIN_TOKEN` nie pozostał placeholderem operacyjnym.

### Analytics

Sprawdź:

- zapisy do D1,
- eksport batch przez Pipelines (Iceberg), zgodnie z konfiguracją `workers/bigquery-batch`,
- spójność `session_id` / `_epir_session_id`, jeśli dotyczy,
- worker `workers/marketing-ingest`: ostatni przebieg cron (logi `[MARKETING_INGEST]`), ingest HTTP (bez tokenów w logach), opcjonalnie próbka `wrangler r2 sql query` nad tabelą marketingową po skonfigurowaniu Pipelines (patrz sekcja `workers/marketing-ingest` powyżej).

### Shopify i frontend

Sprawdź:

- Theme App Extension i Web Pixel w aplikacji Shopify,
- App Proxy,
- Pages secrets,
- działanie `ChatWidget` na storefrontach.

### Consent Gate — smoke test końcowy (cały system)

Po wdrożeniu: migracja D1 + worker `chat` + Pages (`kazka`, `zareczyny`) + deploy aplikacji Shopify (TAE), zweryfikuj:

| Ścieżka | Bez zgody | Po zgodzie (sukces zapisu) | Weryfikacja danych |
|--------|-----------|----------------------------|--------------------|
| **TAE (Online Store)** | UI czatu zablokowane (launcher / formularz; brak wysyłki) | UI odblokowane; czat działa jak wcześniej | `POST` na `/apps/assistant/consent` → **2xx** (typowo **204**) |
| **Hydrogen Kazka** | `ChatWidget` z `consentGranted=false`; brak wysyłki | Po `POST /api/consent` → **204** czat aktywny | Jak wyżej przez BFF |
| **Hydrogen Zareczyny** | Jak Kazka | Jak Kazka | Jak wyżej |
| **D1** | — | — | Nowy wiersz w `consent_events` (append-only) dla zdarzeń zapisanych z powodzeniem |

**Operacyjnie — endpointy zgody (204):**

- **TAE / Online Store:** w DevTools → Network żądanie `POST` do `.../apps/assistant/consent` (lub względne na domenie sklepu) — status **204** lub inny **2xx** zgodnie z workerem; brak ciała odpowiedzi przy 204 jest oczekiwany.
- **Hydrogen:** `POST` same-origin `/api/consent` — odpowiedź **204** po poprawnym forwardzie na worker.

**Operacyjnie — czat po zgodzie (SSE bez zmian):**

- Po odblokowaniu UI wyślij wiadomość testową i potwierdź w Network: `POST` do `/api/chat` (headless) lub `/apps/assistant/chat` (TAE), odpowiedź **`Content-Type: text/event-stream`**, strumień zdarzeń/delta działa jak przed Consent Gate.

## Consent Gate — weryfikacja operacyjna (skrót)

1. **Zgoda:** dla każdej ścieżki (TAE, Kazka, Zareczyny) wykonaj zapis zgody i potwierdź **2xx/204** na odpowiednim `consent` ingress (patrz `EPIR_INGRESS_AND_RUNTIME.md`).
2. **Czat:** niezależnie od zgody sprawdź tylko **po** odblokowaniu, że transport wiadomości to nadal **fetch + SSE** (brak zmiany kontraktu streamu w workerze wyłącznie przez Consent Gate).
3. **D1:** opcjonalnie `wrangler d1 execute ... SELECT` na `consent_events` (lub pipeline analityczny), aby potwierdzić append-only zapis.

## Storefront Hydrogen — baseline funkcjonalny (rozdzielenie „działa” vs „design”)

Ten akapit jest punktem odniesienia, żeby **rozdzielić zamknięty zakres działania sklepu od backlogu wizualnego** bez dublowania dokumentów ani „notatek przy komputerze”.

### Oznaczenie w Git (źródło prawdy)

| Element | Wartość |
|--------|---------|
| **Tag (annotated)** | `storefront-stable-2026-04-28` |
| **Gałąź referencyjna (bieżąca)** | `main`; snapshot zamrożonego baseline: tag `storefront-stable-2026-04-28`. |

Po `git fetch --tags` można wrócić do tego stanu: `git checkout storefront-stable-2026-04-28`. Nowe prace estetyczne lub większy refaktor UI najlepiej prowadzić z osobnego brancha i scalać po regresji.

### Zakres zamknięty w tym baseline (regresja przy każdej istotnej zmianie)

- **Koszyk (Kazka i Zareczyny):** `/cart` — `ADD_TO_CART` zwraca pełny koszyk (pola wymagane przez szufladę), `BUY_NOW` z przekierowaniem na checkout, gdy jest `checkoutUrl`.
- **Layout (`@epir/ui`):** szuflada otwiera się po **wzroście `totalQuantity`** przy kompletnych danych koszyka; unika pustego lub „pół” stanu po fetcherze.
- **Zareczyny:** nawigacja kolekcji (hub / złoto / srebro), filtry zgodne z env; uproszczona ścieżka koszyka bez wcześniejszych eksperymentów z synchronizacją atrybutów sesji w koszyku.
- **SEO:** opisy meta nie przekraczają limitów zgłaszanych przez Hydrogen (m.in. przycięcie opisu sklepu/produktu w `getSeoMeta`).
- **Pakiet UI:** `ProductForm` (m.in. `countryCode`, osobne formularze `ADD_TO_CART` / `BUY_NOW`, `showBuyNow`); eksport `ClientOnly`.

### Backlog (świadomie nie jest częścią powyższego „zamrożenia”)

- Pełny **redesign wizualny** i porządki typografii / siatki bez zmiany kontraktu koszyka.
- Dalsze **dopieszczanie nawigacji** wyłącznie pod wygląd (o ile nie psuje tras i linków).

### Minimalna checklista regresji przed wdrożeniem UI

1. Strona produktu: **„Do koszyka”** → szuflada, poprawna pozycja lub wzrost licznika.
2. Opcjonalnie **„Kup teraz”** → przekierowanie na checkout (gdy sklep zwraca URL).
3. **Nagłówek:** linki kolekcji prowadzą tam, gdzie env (`COLLECTION_*`).
4. **Konsola przeglądarki:** brak masowych błędów hydratacji na świeżej sesji (pojedyncze ostrzeżenia SEO można adresować osobno).

## Bramka go/no-go (formalna checklista release)

Ta sekcja jest **jedyną** kanoniczną bramką operacyjną. Wszystkie pozycje są weryfikowalne (endpoint, sekret, status, kontrakt). Bramka jest podzielona na pięć faz, których kolejność jest wiążąca: **CI → Sekrety i migracje → Postura fail-closed → Deploy → Smoke**. Jakikolwiek FAIL z poniższych pozycji oznacza **NO-GO** — nie wydajemy release i nie przechodzimy do następnej fazy.

### Faza 1. CI i polityki repo (`workflow_dispatch`)

| # | Kontrola | Źródło | Warunek PASS |
|---|----------|--------|--------------|
| 1 | `CI` — `lint`, `typecheck`, `build` | `.github/workflows/ci.yml` (matrix: `kazka`, `zareczyny`) | wszystkie trzy joby zielone na commicie release; jeśli paths-filter pominął matrix, decyzja jest dokumentowana w PR |
| 2 | `S2S validation` — vitest workera `chat` | `.github/workflows/s2s-validation.yml` | zielony przebieg na plikach: `test/ingress_s2s.test.ts`, `test/consent_s2s.test.ts`, `test/consent_app_proxy.test.ts`, `test/app_proxy_ingress_hmac.test.ts`, `test/mcp_policies_retry.test.ts` |
| 3 | `Dependency Policy` | `.github/workflows/dependency-policy.yml` | root `packageManager` zaczyna się od `pnpm@`; brak `aplikacja_epir: "file:../.."` w `workers/**`, `apps/**`, `packages/**`, `extensions/**`; brak wpisu `dependabot` `npm` dla `/workers/analytics` |
| 4 | Branch protection na `main` | `.github/workflows/apply-branch-protection.yml` | aktywne required checks: `build`, `lint`, `typecheck`; `allow_force_pushes=false`; co najmniej 1 approving review |

#### Sygnał CI conformance (P1/P2, ingress contracts)

Dodatkowy sygnał release readiness dla ingressu (uruchamiany jako manualny conformance run na środowisku docelowym):

- `tests/ingress-conformance.mjs` — kontrakt S2S (`401/400/200`) dla `/chat`,
- `tests/app-proxy-conformance.mjs` — kontrakt App Proxy HMAC i widoczność tooli (buyer-facing vs internal-only).

Oczekiwany sygnał: oba skrypty kończą się kodem `0` i drukują końcowy status sukcesu (`Wszystkie scenariusze ingress P0...` / `App Proxy ingress conformance zaliczony.`). Brak tego sygnału oznacza blokadę go/no-go do czasu wyjaśnienia.

### Faza 2. Sekrety i migracje (Cloudflare)

| # | Kontrola | Warunek PASS |
|---|----------|--------------|
| 5 | Sekrety `workers/chat` | ustawione w środowisku produkcyjnym: `AI_GATEWAY_TOKEN`, `SHOPIFY_APP_SECRET`, `EPIR_CHAT_SHARED_SECRET`, `EPIR_OPERATOR_PANEL_SECRET` (panel operatorski — nie dla S2S worker→worker), oraz token storefrontu pasujący do `SHOP_DOMAIN` (`SHOPIFY_STOREFRONT_TOKEN` lub odpowiedni per-storefront token); dla **Project B / internal-dashboard**: `SHOPIFY_ADMIN_TOKEN` (m.in. `read_reports` dla ShopifyQL), opcjonalnie **`MARKETING_OPS_PREVIEW_KEY`** + var **`MARKETING_INGEST_ORIGIN`** (narzędzie `fetch_marketing_preview` — ten sam Bearer co `MARKETING_OPS_PREVIEW_KEY` na `epir-marketing-ingest`); opcjonalnie **`OPENROUTER_API_KEY`** (warianty modelu `or_*` w Dev-asystencie / `X-Epir-Model-Variant`, bez wpływu na domyślny `groq/openai/gpt-oss-120b`) |
| 6 | Sekrety `workers/rag-worker` | `ADMIN_TOKEN` ustawiony i **nie jest placeholderem** z repo; `CANONICAL_MCP_URL`, `SHOP_DOMAIN` ustawione; bindingi `AI`, `VECTOR_INDEX` widoczne dla workera |
| 7 | Sekrety `workers/analytics` | `SHOPIFY_WEBHOOK_SECRET` ustawione |
| 8 | Sekrety i vars `workers/bigquery-batch` | eksport: `PIPELINE_*_INGEST_URL` (co najmniej jeden); **RPC `run_analytics_query`:** `R2_SQL_API_TOKEN` + vars `R2_SQL_*` / `WAREHOUSE_SQL_*` (patrz [`wrangler.toml`](../../workers/bigquery-batch/wrangler.toml)) |
| 9 | Sekrety i vars `workers/analyst-worker` | `ANALYST_HTTP_BEARER` (`wrangler secret put` w katalogu workera); deploy **po** `workers/bigquery-batch`; w prod **`ANALYST_EXPOSE_VALID_QUERY_IDS=false`** (lub brak); opcjonalnie limity `ANALYST_RATE_LIMIT_*` jak w sekcji `workers/analyst-worker` poniżej |
| 10 | Sekrety `workers/marketing-ingest` | `MARKETING_PIPELINE_INGEST_URL`; opcjonalnie `MARKETING_PIPELINE_INGEST_TOKEN`; `GA4_SERVICE_ACCOUNT_JSON`; Ads: `GOOGLE_ADS_CLIENT_SECRET`, `GOOGLE_ADS_REFRESH_TOKEN`, `GOOGLE_ADS_DEVELOPER_TOKEN`; opcjonalnie `GOOGLE_ADS_LOGIN_CUSTOMER_ID` (MCC), `MARKETING_OPS_PREVIEW_KEY` (Bearer do `/ops/marketing-preview`); vars (nie-sekret): `GA4_PROPERTY_ID`, `GOOGLE_ADS_CLIENT_ID`, `GOOGLE_ADS_CUSTOMER_ID` (Dashboard / `[vars]` — patrz [`wrangler.toml`](../workers/marketing-ingest/wrangler.toml)) |
| 11 | Sekrety Cloudflare Pages (`kazka`, `zareczyny`) | `SESSION_SECRET`, `PUBLIC_STOREFRONT_API_TOKEN`, `PRIVATE_STOREFRONT_API_TOKEN` (gdzie wymagany), `PUBLIC_CUSTOMER_ACCOUNT_API_CLIENT_ID`, `EPIR_CHAT_SHARED_SECRET` ustawione w obu projektach Pages |
| 12 | Migracja D1 `ai-assistant-sessions-db` | `005_consent_events.sql` zaaplikowana (`wrangler d1 execute ai-assistant-sessions-db --remote --file=./migrations/005_consent_events.sql` z katalogu `workers/chat`); tabela `consent_events` istnieje |
| 13 | Migracje D1 `jewelry-analytics-db` | wszystkie aktualne pliki migracyjne z `workers/bigquery-batch` zaaplikowane na bazę docelową |

### Faza 3. Postura ingress i fail-closed (przed-deploy guard)

Każda pozycja w tej fazie ma być sprawdzona na zdeployowanej (lub planowanej) konfiguracji workera. Nie wolno polegać na publicznych URL `*.workers.dev` dla internal ruchu.

| # | Endpoint / kontrakt | Warunek PASS |
|----|---------------------|--------------|
| 13 | `workers/rag-worker` `POST /admin/upsert` | fail-closed: brak / placeholder / niepoprawny `ADMIN_TOKEN` ⇒ `401` |
| 14 | `workers/bigquery-batch` `POST /internal/analytics/query` | `workers_dev = false` w `wrangler.toml`; wywołanie HTTP zwraca `404` (tylko **RPC** `BigQueryBatchS2SRpc` z czatu lub `epir-analyst-worker`) |
| 15 | `workers/analyst-worker` `POST /v1/warehouse/query` | bez `Authorization: Bearer` zgodnego z `ANALYST_HTTP_BEARER` ⇒ `401`; brak sekretu ⇒ `503`; zły `Content-Type` (brak `application/json`) ⇒ `415`; nieznany `queryId` ⇒ `400` (enumeracja `validQueryIds` tylko gdy `ANALYST_EXPOSE_VALID_QUERY_IDS=true`); przekroczenie limitu żądań ⇒ `429` |
| 16 | `workers/analytics` `GET /pixel/events`, … (chronione odczyty) | bezpośredni HTTP ⇒ `404` (odczyty z edge czatu idą przez **`ANALYTICS_S2S_RPC`**) |
| 17 | `workers/chat` S2S `POST /chat`, `POST /consent` | brak `X-EPIR-SHARED-SECRET` ⇒ `401`; brak `storefrontId` lub `channel` ⇒ `400` |
| 18 | `workers/chat` App Proxy `POST /apps/assistant/chat`, `POST /apps/assistant/consent` | błędny / brakujący HMAC ⇒ `401` (weryfikowane przez `workers/chat/src/security.ts`) |
| 19 | Service binding chat → analytics / warehouse RPC | `workers/chat/wrangler.toml` definiuje **`ANALYTICS_WORKER`**, **`ANALYTICS_S2S_RPC`** i **`BIGQUERY_BATCH_RPC`**; **brak** fallbacku po publicznym `*.workers.dev` w kodzie ruchu internal |

### Faza 4. Deploy w kanonicznej kolejności

| # | Krok | Warunek PASS |
|----|------|--------------|
| 20 | `workers/rag-worker` deploy | `wrangler deploy` zakończony 200; `GET /health` zwraca 200 z produkcyjnej domeny workera |
| 21 | `workers/analytics` deploy | `wrangler deploy` zakończony; bindingi i sekrety widoczne; brak publicznego dostępu do chronionych endpointów (zob. poz. 16) |
| 22 | `workers/bigquery-batch` deploy | `wrangler deploy` zakończony; `workers_dev` pozostaje `false` po deployu (zob. poz. 14) |
| 23 | `workers/analyst-worker` deploy | `wrangler deploy` zakończony **po** poz. 22; binding `BIGQUERY_BATCH_RPC` widoczny; `ANALYST_HTTP_BEARER` ustawiony zgodnie z poz. 9, jeśli używasz HTTP |
| 24 | `workers/marketing-ingest` deploy | `wrangler deploy` zakończony; `workers_dev = false`; ingest URL i sekrety Google ustawione zgodnie z poz. 10 |
| 25 | `workers/chat` deploy | uruchamiany **po** poz. 12 i poz. 20–24; obejmuje trasy `POST /chat`, `POST /consent`, `POST /apps/assistant/chat`, `POST /apps/assistant/consent` |
| 26 | `shopify app deploy` | TAE `asystent-klienta` (z Consent Gate w assetach) + App Proxy `prefix=apps`, `subpath=assistant` zsynchronizowane z workerem |
| 27 | Cloudflare Pages deploy | `apps/kazka` → `kazka-hydrogen-pages` (`--branch=main`); `apps/zareczyny` → `zareczyny-hydrogen-pages` (`--branch=main`); obie aplikacje serwują trasy `api.chat.ts` i `api.consent.ts` |

### Faza 5. Smoke testy po deployu

#### Automatyczna bramka CI po deployu workerów (fail-closed)

Po sukcesie joba `deploy-workers` w `.github/workflows/deploy.yml` uruchamiany jest job `post-deploy-smoke`, który wykonuje `node scripts/smoke/post-deploy-smoke.mjs` (syntetyczne żądania HTTP — ok. kilku minut, deterministyczny exit code ≠ 0 przy dowolnej porażce).

| Sekret repozytorium GitHub | Znaczenie |
|----------------------------|-----------|
| `SMOKE_BASE_URL` | Origin workera czatu HTTPS (bez końcowego `/`), ten sam host co ingress produkcyjny / staging (np. `https://asystent.epirbizuteria.pl`). Używany do `POST /apps/assistant/chat`, `POST /chat`, `POST /pixel/events`, `GET /pixel/events` przez workera czatu (upload HTTP do analytics, chronione odczyty przez **`ANALYTICS_S2S_RPC`** z nagłówkami S2S jak przy `/chat`). |
| `SMOKE_RAG_HEALTH_URL` | Pełny URL `GET /health` workera `epir-rag-worker` (repo nie zawiera trasy DNS dla RAG — adres ustala się po stronie Cloudflare, np. domena workera lub inny jawny endpoint). |
| `SMOKE_EPIR_CHAT_SHARED_SECRET` | Wartość zgodna z sekretem **`EPIR_CHAT_SHARED_SECRET`** w `workers/chat` (`X-EPIR-SHARED-SECRET` + storefront/channel przy smoke `GET /pixel/events`). Wymagana w CI, chyba że `SKIP_D1_VERIFY=1`. |

Weryfikacja D1 w tej bramce odbywa się **przez HTTP** (`GET /pixel/events`), nie przez `wrangler d1 execute` (token Cloudflare nadal jest potrzebny do deployu workerów).

| # | Ścieżka / dane | Warunek PASS |
|----|----------------|--------------|
| 26 | Online Store (TAE) | `POST {shop}/apps/assistant/consent` po wyrażeniu zgody ⇒ **2xx** (typowo **204**); `POST {shop}/apps/assistant/chat` ⇒ odpowiedź `Content-Type: text/event-stream` |
| 27 | Hydrogen `kazka` | `POST /api/consent` ⇒ **204**; `POST /api/chat` ⇒ `text/event-stream`; BFF dokleja `X-EPIR-SHARED-SECRET`, `X-EPIR-STOREFRONT-ID`, `X-EPIR-CHANNEL` |
| 28 | Hydrogen `zareczyny` | jak poz. 27, z odpowiednim `storefrontId` / `channel` |
| 29 | D1 `consent_events` | nowy wiersz append-only dla każdego pomyślnego zapisu zgody (potwierdzone `wrangler d1 execute ai-assistant-sessions-db --remote --command="SELECT * FROM consent_events ORDER BY created_at DESC LIMIT 5;"`) |
| 30 | RAG retrieval | `GET /health` ⇒ 200; `POST /search/policies` i `POST /search/products` zwracają wyniki dla referencyjnego zapytania; `ADMIN_TOKEN` nie jest placeholderem |
| 31 | Analytics pipeline | webhooki Shopify trafiają do D1 `jewelry-analytics-db`; batch eksport przez Pipelines do Iceberg; spójność `_epir_session_id` ↔ `session_id` zachowana w lejku; **marketing:** worker `epir-marketing-ingest` zasil ingest GA4/Ads (bez PII w logach), Iceberg w namespace `marketing` zgodnie z operacyjną konfiguracją Pipelines |
| 32 | Negatywny smoke (no-go canary) | powtórzenie poz. **13**, **14**, **16** na produkcyjnym workerze — nieautoryzowany klient dostaje oczekiwany `401`/`400`/`404` zgodnie z kontraktem |

### Reguła blokady

- **PASS = wszystkie pozycje 1–32 spełnione.** Jakikolwiek FAIL ⇒ **NO-GO**, niezależnie od jego „wagi”. Nie przepuszczamy bramki pojedynczym wyjątkiem ani notatką „dopiszemy w hotfixie”.
- Nowy sekret, endpoint, migracja albo check CI musi być dopisany do tej checklisty **przed** release, w którym staje się wymagany. Niezdokumentowana zależność jest traktowana jako FAIL.
- Bramka jest jedna i jest tutaj. Nie utrzymujemy „roboczych” checklist w PR, issue ani notatkach prywatnych.

## Epik (opcjonalny): BigQuery → R2 SQL / Iceberg cutover

Nie jest wymagany do działania strumienia marketingowego (GA4/Ads → Pipelines → Iceberg w namespace `marketing`). Uruchom dopiero po stabilnym zasilaniu hurtowni i akceptacji produktowej.

Checklista (issue w trackerze z tym samym tytułem):

1. **Dual-read:** porównaj wyniki raportów referencyjnych między BigQuery a R2 SQL (te same zapytania logiczne, tolerancja różnic czasowych eksportu).
2. **Checksum / reconciliation:** dzienne sumy kontrolne po kluczu biznesowym (np. data + kanał) dla wybranych tabel.
3. **Produkt:** decyzja, czy `run_analytics_query`, dbt (`analytics/dbt`) i narzędzia wewnętrzne przełączają odczyt na R2 SQL; aktualizacja [`EPIR_DATA_SCHEMA_CONTRACT.md`](EPIR_DATA_SCHEMA_CONTRACT.md) jako jednego kontraktu.
4. **Rollback:** procedura powrotu do BigQuery jako źródła odczytów bez utraty zapisów (Iceberg pozostaje źródłem prawdy dla nowych strumieni niezależnie od BQ).

## Zasady utrzymania

1. Nie opisujemy deployu w kilku równoległych dokumentach.
2. Każda zmiana w kolejności wdrożenia, secretach lub bindingach aktualizuje ten plik.
3. Jeśli operacyjny stan różni się od repo, repo wymaga korekty — nie odwrotnie.
4. Runbook operacyjny ma pozostać krótki i wykonywalny, bez checkpointów historycznych i bez notatek „tymczasowych”.
5. Bramka go/no-go z sekcji powyżej jest jedynym formalnym źródłem decyzji release; rozszerzenia kontraktu security/CI najpierw trafiają do tej checklisty, a dopiero potem do narzędzi automatyzacji.
