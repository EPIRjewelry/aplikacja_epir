# EPIR AI ECOSYSTEM MASTER

## Rola tego dokumentu

To jest główny opis aktualnego modelu systemu EPIR AI. Odpowiada na pytanie **jak system jest zbudowany**, **jak przepływa ruch**, **jak rozdzielone są storefronty i kanały** oraz **jakie role pełnią agenci AI**.

Jeżeli inny dokument opisuje architekturę inaczej, ten plik wygrywa razem z `EPIR_AI_BIBLE.md`.

## TL;DR

1. EPIR działa jako **jedna aplikacja Shopify**: `epir_ai`.
2. System obsługuje trzy buyer-facing kanały: `online-store`, `hydrogen-kazka`, `hydrogen-zareczyny`.
3. Commerce live w Shopify, stan sesji w Cloudflare, a zaufanie do żądania jest ustalane przez warstwę ingressu.
4. Online Store wchodzi przez Shopify App Proxy, a storefronty headless przez BFF `/api/chat` i S2S `/chat`.
5. `storefrontId` i `channel` determinują routing wiedzy, promptów i persony.
6. Buyer-facing agent to `Gemma`; kontekst wewnętrzny to `Dev-asystent`.

## Niezmienne fakty

- aplikacja Shopify: `epir_ai`
- repo źródłowe: `EPIRjewelry/aplikacja_epir`
- gałąź kanoniczna: `main`
- produkcyjny backend AI: Cloudflare Workers
- production shop domain: `epir-art-silver-jewellery.myshopify.com`

## Model systemu

### 1. Osie źródeł prawdy

| Oś              | Źródło prawdy     | Zakres                                                                                            |
| --------------- | ----------------- | ------------------------------------------------------------------------------------------------- |
| Commerce        | Shopify           | produkty, ceny, kolekcje, polityki, koszyk, zamówienia                                            |
| State           | Cloudflare        | sesje, historia rozmowy, rate limiting, pamięć pomocnicza, analityczne eventy po stronie workerów |
| Trust / ingress | App Proxy lub S2S | tożsamość żądania, kanał, storefront, autoryzacja wejścia                                         |

Żadna pojedyncza warstwa nie zastępuje dwóch pozostałych.

### 2. Główne komponenty

#### Frontendy

- `extensions/asystent-klienta` — Theme App Extension dla Online Store
- `apps/kazka` — Hydrogen storefront Kazka
- `apps/zareczyny` — Hydrogen storefront Zaręczyny

#### Backend

- `workers/chat` — główny Chat Worker / MCP
- `workers/rag-worker` — wyszukiwanie RAG i budowa kontekstu
- `workers/analytics` — ingest zdarzeń analitycznych
- `workers/bigquery-batch` — batch export do BigQuery

#### Storage i runtime state

- Durable Objects: `SessionDO`, `RateLimiterDO`, `TokenVaultDO`
- D1: `ai-assistant-sessions-db`, `jewelry-analytics-db`
- Vectorize: warstwa wiedzy / retrieval
- BigQuery: hurtownia analityczna

### 3. Ingress i routing ruchu

#### Online Store

Przeglądarka kupującego komunikuje się wyłącznie przez Shopify App Proxy:

- `https://{shop}/apps/assistant/chat`

Shopify forwarduje żądanie do workera i dokłada kontekst podpisu HMAC.

#### Headless storefronty

Przeglądarka nie rozmawia bezpośrednio z workerem. Obowiązuje wzorzec:

- browser → same-origin `POST /api/chat`
- Remix / BFF → `POST https://asystent.epirbizuteria.pl/chat`
- nagłówki S2S:
  - `X-EPIR-SHARED-SECRET`
  - `X-EPIR-STOREFRONT-ID`
  - `X-EPIR-CHANNEL`

Aktualny stan repo:

- `kazka` i `zareczyny` rozwiązują browser chat przez `/api/chat`
- ich trasy `api.chat.ts` doklejają wymagane nagłówki S2S
- `ChatWidget` wysyła także `storefrontId` i `channel` w body

Szczegóły techniczne są w `docs/EPIR_INGRESS_AND_RUNTIME.md`.

### 4. Multi-tenant routing: `storefrontId` + `channel`

Każde żądanie po przejściu ingressu jest rozumiane przez pryzmat dwóch pól:

- `storefrontId` — konkretna marka / storefront
- `channel` — logiczny kanał uruchomienia

Typowe kanały:

- `online-store`
- `hydrogen-kazka`
- `hydrogen-zareczyny`
- `internal-dashboard`

Te pola sterują:

- wyborem persony,
- doborem danych RAG,
- konfiguracją dostępu do narzędzi,
- polityką odpowiedzi i tonem.

### 5. Role AI

#### `Gemma` — buyer-facing

Aktywna dla kanałów sklepowych.

Zakres:

- doradztwo produktowe,
- koszyk,
- polityki sklepu,
- język luksusowy i sprzedażowy.

Nie wolno jej:

- wchodzić w architekturę,
- tłumaczyć backendu,
- rozmawiać jak agent developerski.

#### `Dev-asystent` — internal / developer-facing

Aktywny w IDE i w `internal-dashboard`.

Zakres:

- architektura Shopify / EPIR,
- MCP i backend,
- analityka, RAG, workers, deployment.

Nie wolno mu:

- udawać Gemmy,
- mieszać tonu buyer-facing z technicznym.

### 6. Obieg danych

#### Czat

1. żądanie wchodzi przez App Proxy albo BFF + S2S,
2. `workers/chat` weryfikuje ingress,
3. `SessionDO` zarządza stanem rozmowy,
4. worker korzysta z MCP / RAG / narzędzi,
5. odpowiedź jest strumieniowana do klienta,
6. historia sesji jest zapisywana do D1.

#### RAG

- `workers/rag-worker` dostarcza wyszukiwanie produktowe i policyjne,
- chat worker używa service binding `RAG_WORKER`,
- MCP pozostaje źródłem preferowanym tam, gdzie potrzebne są świeże dane commerce.

#### Analytics

- frontend i worker generują zdarzenia,
- `workers/analytics` zapisuje je do D1,
- `workers/bigquery-batch` eksportuje je do BigQuery.

## Project A vs Project B

### Project A — produkcja buyer-facing

To cały ruch klienta sklepu:

- Theme App Extension
- Hydrogen storefronty
- buyer-facing chat

Tu obowiązują pełne zasady ingressu, bezpieczeństwa i roli Gemmy.

### Project B — narzędzia wewnętrzne i analityczne

To obszar wewnętrzny:

- analityka,
- BigQuery,
- operacje administracyjne,
- agentowe workflow developerskie.

Project B może korzystać z serwerowych wyjątków operacyjnych, ale nie wolno przenosić tych wyjątków do frontendu buyer-facing.

## Zestaw kanonicznej dokumentacji

Poza tym plikiem obowiązują jeszcze:

- `AGENTS.md`
- `EPIR_AI_BIBLE.md`
- `docs/README.md`
- `docs/EPIR_INGRESS_AND_RUNTIME.md`
- `docs/EPIR_DATA_SCHEMA_CONTRACT.md`
- `docs/EPIR_DEPLOYMENT_AND_OPERATIONS.md`
- `docs/EPIR_BLUEPRINTS_AND_EXCEPTIONS.md`

NotebookLM ma utrzymywać dokładnie ten sam zestaw plików, bez dodatkowych dokumentów pobocznych.
