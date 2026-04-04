# EPIR AI – Bible for Agents & Collaborators

## ⚠️ Czytaj najpierw

Ten plik jest **jednym z dwóch podstawowych dokumentów** dla całego repozytorium `d:\aplikacja_epir`.

**Obowiązkowa kolejność czytania dla nowej osoby:**

1. `EPIR_AI_ECOSYSTEM_MASTER.md` — onboarding, aktualna architektura, role agentów, prompty produkcyjne
2. `EPIR_AI_BIBLE.md` — orthodoksja, zasady nienegocjowalne, guardrails dla zmian

## ⚠️ DROGOWSKAZ (źródło prawdy)

**EPIR AI = jedna aplikacja Shopify.**

- **Jedna** aplikacja: `epir_ai`
- **Jedna** gałąź: `main`
- **Jedno** miejsce pracy: `d:\aplikacja_epir`

Nie ma „drugiej aplikacji”, forka czatu ani równoległego backendu. Deploy z `main`. Wszystko w tym repo.

---

Ten dokument jest centralną bazą wiedzy („biblią”) dla wszystkich agentów AI i ludzi współpracujących przy aplikacji **EPIR AI (epir_ai)**.

Zawiera:

- opis całej architektury (Shopify App, App Proxy, Workers, D1/DO, Hydrogen, TAE, pixels),
- podział ról między światem Shopify AI (Knowledge Base) a naszym własnym MCP,
- zasady orthodoksji (ESOG),
- zasady budowy pamięci czatbota,
- kontekst storefrontów **kazka** i **zareczyny**.

Jeżeli jakakolwiek inna odpowiedź AI jest sprzeczna z tym dokumentem, **ten dokument wygrywa**.

Ten dokument należy czytać **łącznie** z `EPIR_AI_ECOSYSTEM_MASTER.md`:

- `EPIR_AI_ECOSYSTEM_MASTER.md` opisuje, **jak system jest zbudowany i jak rozdzielone są role agentów**,
- `EPIR_AI_BIBLE.md` definiuje, **jakich zasad nie wolno łamać przy implementacji, review i zmianach architektonicznych**.

---

## 1. Wysokopoziomowa architektura EPIR AI

### 1.1. Shopify App: epir_ai

- Nazwa: **EPIR AI (epir_ai)**
- Domain: `epirbizuteria.pl`
- Typ: Pełnozakresowa aplikacja Shopify z embedded extensions i serverless backendem.
- Konfiguracja (fragment `shopify.app.toml`):

```toml
name = "epir_ai"
application_url = "https://asystent.epirbizuteria.pl"
embedded = true
extension_directories = ["extensions/asystent-klienta", "extensions/my-web-pixel"]
scopes = "customer_read_customers,customer_read_orders,customer_read_store_credit_*,unauthenticated_read_product_listings"

app_proxy: url = "https://asystent.epirbizuteria.pl" subpath = "assistant" prefix = "apps"

auth.redirect_urls = ["https://asystent.epirbizuteria.pl/api/auth"]
```

**ZNACZENIE:**

- **App Proxy**:

  - publiczny endpoint w sklepie:  
    `https://{shop_domain}/apps/assistant/...`
  - proxowany do:  
    `https://asystent.epirbizuteria.pl/...` (Chat Worker).

- To jest **kanoniczny punkt wejścia** (ingress) dla backendu EPIR AI (MCP) pod domeną sklepu.

### 1.2. Backend – Cloudflare Workers

#### 1.2.1. Chat Worker (MCP) – `asystent.epirbizuteria.pl`

**Rola:**

Główny AI assistant (MCP) obsługujący rozmowy klientów dla wszystkich frontów:

- Theme App Extension (asystent-klienta),
- Hydrogen storefronty `kazka` i `zareczyny`,
- ewentualne inne kanały.

**Technologia i komponenty:**

- Runtime: Cloudflare Workers (TypeScript).
- Modele AI:
  - Groq API (gpt-oss-120B),
  - fallback: llama-3.2-11b-vision dla obrazów.
- Durable Objects:

  - **SessionDO** – per-session state:
    - bieżąca historia (max ~200 wiadomości in-memory),
    - starsze → `ai-assistant-sessions-db/messages` (D1),
    - RPM rate limiting per sesja,
    - replay protection (HMAC/timestamp),
    - product view tracking, flags, itp.
  - **RateLimiterDO** – per-shop token bucket:
    - np. 40 req/s (Shopify Admin API limit),
    - refill 2 tokens / 50ms,
    - chroni przed przekroczeniem limitów MCP tools.
  - **TokenVaultDO** – customer anonymization:
    - mapowanie `customer_id ↔ sha256_token`,
    - persystencja w DO storage / D1,
    - RODO: możliwość expiracji i cleanupu.

- Integracje MCP tools (tool schemas):
  - `search_shop_catalog` – via Vectorize / Admin API,
  - `search_policies_faqs` – FAQ / polityki sklepu,
  - `get_customer_info` – profil klienta,
  - `get_cart_status` – stan koszyka (Storefront API),
  - `get_order_status` – historia zamówień,
  - `register_client` – ProfileService,
  - itp.

**Flow (request/response):**

1. Client → Theme/Hydrogen → `https://{shop_domain}/apps/assistant` (App Proxy)
2. App Proxy (Shopify) → `https://asystent.epirbizuteria.pl` (Chat Worker)
3. Chat Worker:
   - weryfikacja HMAC / autoryzacja,
   - SessionDO (historia, rate limit, replay),
   - TokenVaultDO (anonimizacja, jeśli dotyczy),
   - RAG / Vectorize, MCP tools, Groq,
   - streaming SSE do klienta (odpowiedź czata + metadane, np. session_id).

#### 1.2.2. RAG Worker – `epir-rag-worker`

**Rola:**

Silnik RAG dla wiedzy produktowej i polityk:

- embeddings: `nomic-embed-text-v1.5`,
- vektoryzacja: Cloudflare Vectorize,
- źródła:
  - produktowy katalog,
  - FAQ,
  - polityki.

Obsługuje:

- natywne zapytania Vectorize,
- fallback MCP (`search_shop_catalog` przez Admin/Storefront API).

#### 1.2.3. Analytics Worker – `epir-analityc-worker`

**Rola:**

Agregacja zdarzeń:

- from: Web Pixel extension `my-web-pixel` (`page_view`, `product_view`, `add_to_cart`, `purchase`),
- from: Chat Worker (proxy `/pixel`).

Persystencja:

- D1: `jewelry-analytics-db`
  - `pixel_events`,
  - `session_events`,
  - `page_views`,
  - `batch_exports`.

#### 1.2.4. BigQuery Batch Worker – `bigquery-batch`

**Rola:**

ETL → BigQuery:

- CRON: ~2:00 UTC,
- source: D1 (`jewelry-analytics-db`, `ai-assistant-sessions-db`),
- target: BigQuery dataset `epir_jewelry`:
  - `pixel_events` (zdenormalizowane),
  - `messages` (zanonimizowane).

---

### 1.3. Bazy danych i storage

- **D1 – `ai-assistant-sessions-db`**:
  - `messages` – zarchiwizowane wiadomości:
    - `session_id`, `role`, `content`, `timestamp`, `tool_calls`.
  - storage DO (SessionDO, TokenVaultDO).
- **D1 – `jewelry-analytics-db`**:
  - `pixel_events` – zdarzenia pixelowe,
  - `batch_exports` – logi eksportów,
  - RateLimiterDO data.
- **Vectorize**:
  - embeddings: `nomic-embed-text-v1.5`,
  - metadata: m.in. `storefront`, `collection`, `topic`, itd.
- **BigQuery – `epir_jewelry`**:
  - `pixel_events`,
  - `messages` (session_id hashed, customer_id zanonimizowane).

---

### 1.4. Frontend: Shopify Extensions i Hydrogen

#### 1.4.1. Theme App Extension – `asystent-klienta`

- Widget czatu w motywie (Online Store).
- Łączy się z Chat Workerem tylko przez:
  - `https://{shop_domain}/apps/assistant/...`
- Nie implementuje logiki AI; jest wyłącznie UI + klient API.

#### 1.4.2. Web Pixel – `my-web-pixel`

- Subskrybuje zdarzenia Shopify Pixels:
  - `page_view`, `product_view`, `add_to_cart`, `purchase`.
- Wysyła eventy do `epir-analityc-worker` (`/pixel`).

#### 1.4.3. Hydrogen storefronty – `kazka` i `zareczyny`

- Niezależne aplikacje Hydrogen/Remix (np. na Cloudflare Pages).
- Każda ma:

  - `ChatWidget` → `https://{shop_domain}/apps/assistant/chat`,
  - `createStorefrontClient` → Storefront API.

- **Nie** wywołują Admin API z klienta.

---

## 2. Dwa „światy AI”: Shopify Knowledge Base vs EPIR MCP

### 2.1. Shopify Knowledge Base (help.shopify.com)

- Aplikacja Shopify „Knowledge Base” służy do:
  - oglądania i modyfikacji **FAQ wykorzystywanych przez Shopify AI shopping agents**,
  - monitorowania, o co pytają kupujący w kanałach Shopify AI.
- Jest to interfejs i warstwa danych dla:
  - **AI shopping agents Shopify**, nie dla naszego własnego czata.

**WAŻNE:**

- Knowledge Base **nie jest backendem dla EPIR MCP**.
- Możemy z niej:
  - czerpać insighty (jakie pytania się pojawiają),
  - dostosowywać oficjalne FAQ Shopify AI,
- ale nasz własny czat i MCP opierają się na:
  - naszym Chat Workerze,
  - naszym RAG Workerze,
  - naszym D1/Vectorize/BigQuery.

### 2.2. EPIR MCP

- Nasz MCP (Chat Worker + D1/DO + RAG Worker) jest:
  - jedynym źródłem prawdy dla:
    - pamięci rozmów,
    - logiki AI czata,
    - integracji z naszymi storefrontami (kazka, zareczyny, motyw).
- Fronty (TAE, Hydrogen) → ZAWSZE przez:
  - `https://{shop_domain}/apps/assistant`.

---

## 3. Zasady orthodoksji (ESOG) – co jest nienegocjowalne

### 3.1. Apps vs frontend

- **Apps (epir_ai) + Workers = miejsce logiki biznesowej, AI, integracji.**
- **Frontend (Theme, Hydrogen) = tylko UI + klient API.**

MUST:

- Nigdy nie używamy:
  - Admin API z klienta,
  - tokenów admin (`SHOPIFY_ADMIN_ACCESS_TOKEN`) w bundlu,
  - logiki AI po stronie przeglądarki.

Frontend:

- może tylko:
  - wołać `/apps/assistant`,
  - korzystać z Storefront API (public/private token) przez `createStorefrontClient`.

### 3.2. Sekrety i bezpieczeństwo

MUST:

- `SHOPIFY_ADMIN_ACCESS_TOKEN`, inne klucze admin, Groq API key, Google private key:
  - trzymane wyłącznie w secrets / env Workera / backendu (wrangler secrets),
  - nigdy w repo jako wartości,
  - nigdy w kodzie wykonywanym po stronie klienta.
- App Proxy:
  - HMAC weryfikowany po stronie Chat Workera,
  - brak zaufania do requestów bez ważnego HMAC.

### 3.3. Kontekst MCP: storefrontId / channel

MUST:

- Każde żądanie czatowe do MCP musi zawierać co najmniej:
  - `storefrontId` (alias, np. `"kazka"`, `"zareczyny"`, `"online-store"`),
  - `channel` (np. `"hydrogen-kazka"`, `"hydrogen-zareczyny"`, `"online-store"`).

SHOULD:

- Dodatkowo:
  - `route`, `collectionHandle`, `locale`, `consentFlags`.

MCP:

- używa `storefrontId` do wyboru:
  - odpowiedniego klienta Storefront API,
  - odpowiedniego profilu wiedzy (RAG/metaobjecty),
  - odpowiednich polityk.

### 3.4. Pamięć i logika czata

MUST:

- Stan Conversation/Message:
  - przechowywany wyłącznie w backendzie (SessionDO + D1),
  - frontend trzyma tylko „cień” (UI state).
- Po odświeżeniu strony:
  - frontend rekonstruuje UI na podstawie `GET /history` z MCP,
  - jeśli cokolwiek się nie zgadza, stan backendu jest nadrzędny.

### 3.5. Kontrakty Shopify Admin API `2026-04+` (metafields / metaobjects)

MUST (zgodnie z oficjalną dokumentacją Shopify):

- Przy **zapisach** metafields typu `json` przez Admin API w wersji **`2026-04` i nowszej** obowiązuje limit **128 KB** na wartość. Nie projektuj monolitycznych konfiguracji JSON na produktach powyżej tego progu — używaj **metaobjects** i referencji.
- **App-owned metaobjects** (typy `$app:…`, w tym deklaratywne definicje) od **`2026-04+`** mogą być odczytywane i zapisywane przez owning app **bez dodatkowych access scopes**. **Merchant-owned** metaobjects nadal wymagają właściwych scope'ów.

Szczegóły i linki do changelogów: [`docs/SHOPIFY_PLATFORM_2026_04.md`](docs/SHOPIFY_PLATFORM_2026_04.md).

SHOULD:

- Przy każdej nowej integracji zapisującej duże JSON-y do metafields zweryfikuj rozmiar i model danych.

---

## 4. Kazka – osobna baza wiedzy

### 4.1. Kim jest kazka

- Osobny Hydrogen storefront (`apps/kazka`).
- Asortyment i narracja różne od głównego sklepu/zareczyny.
- Frontend:
  - używa `createStorefrontClient` z tokenem przypisanym do headless channel kazka,
  - `ChatWidget` woła `/apps/assistant`.

### 4.2. Storefront ID i alias

MUST:

- W Adminie:
  - `Settings → Apps and sales channels → Headless (Kazka)` → skopiuj **Storefront ID**.
- W Chat Workerze:

```ts
const STOREFRONTS = {
  kazka: {
    storefrontId: "gid://shopify/Storefront/XXXX", // realne ID z Admina
    apiToken: env.PUBLIC_STOREFRONT_API_TOKEN_KAZKA,
    // profil RAG, metaobject profile, itp.
  },
  // ...
};
```

- W requestach z kazka:

```json
{ "storefrontId": "kazka", "channel": "hydrogen-kazka", "...": "..." }
```

Worker:

- mapuje `"kazka"` → faktyczne GID + token.

### 4.3. RAG i wiedza kazki

SHOULD:

- W RAG (Vectorize):
  - każdy dokument kazki (produkty, FAQ, polityki) oznaczać:
    - `metadata.storefront = "kazka"`.
- Przy zapytaniu z `storefrontId = "kazka"`:
  - RAG filtruje/boostuje `storefront="kazka"`.

### 4.4. Profil metaobject kazka_ai_profile

SHOULD:

- Zdefiniuj metaobject `kazka_ai_profile` z polami:
  - `brand_voice`,
  - `core_values`,
  - `faq_theme`,
  - `promotion_rules`,
  - itp.
- MCP:
  - ładuje ten profil dla `storefrontId="kazka"`,
  - przekazuje jako część system prompt / kontekstu do modelu.

---

## 5. Zareczyny – drugi storefront i jego wiedza

Zasady są analogiczne do kazka.

MUST:

- W Admin:
  - ustalić Storefront ID dla storefrontu `zareczyny`.
- W Workerze:

```ts
const STOREFRONTS = {
  kazka: { ... },
  zareczyny: {
    storefrontId: 'gid://shopify/Storefront/YYYY',
    apiToken: env.PUBLIC_STOREFRONT_API_TOKEN_ZARECZYNY,
    privateToken: env.PRIVATE_STOREFRONT_API_TOKEN_ZARECZYNY, // używany do odczytu metaobject `ai_profile`
    // profil RAG, metaobject profile, itp.
  },
};
```

- W requestach z Hydrogen `zareczyny`:

SHOULD:

- Jeśli zareczyny ma osobny asortyment/narrację (np. pierścionki zaręczynowe):
  - mieć osobny profil wiedzy (`zareczyny_ai_profile`),
  - osobny segment RAG (`metadata.storefront="zareczyny"`),
  - ewentualnie logikę powiązaną z kolekcją `engagement-rings`.

---

## 6. Agenci AI w tym ekosystemie

### 6.1. ESOG – EPIR Shopify Orthodoxy Guardian

- Strażnik ortodoksji:

  - recenzuje architekturę i kod,
  - ocenia: **Compliant / Partially / Non-compliant / Needs design**,
  - pilnuje zasad z tego dokumentu i z oficjalnych docs Shopify.

- Nigdy nie „naprawia” kodu – tylko:
  - wskazuje naruszenia,
  - priorytetyzuje naprawy (MUST / SHOULD / NICE-TO-HAVE),
  - linkuje do zasad/dokumentów.

### 6.2. Fix Agent (EFA) – opcjonalny

- Agent implementacyjny:
  - dostaje output ESOG (lista naruszeń + rekomendacje),
  - generuje konkretne patche (zmiany kodu, configów, dokumentacji),
  - działa **pod kontrolą** ESOG (ESOG weryfikuje jego zmiany).

### 6.3. Główny agent (Composer/Dev)

- Normalnie używany do developmentu:
  - tworzy kod, schematy, migracje, konfiguracje,
  - korzysta z niniejszej „Biblii” jako bazy wiedzy.

---

## 7. Jak z tego korzystać

1. **Ludzie w zespole**:

   - czytają ten dokument jako:
     - overview architektury,
     - listę zasad bezpieczeństwa/orthodoksji,
     - przewodnik po kazka, zareczyny, MCP,
   - przy zmianach w architekturze / kodzie:
     - odwołują się do niego jako do źródła prawdy.

2. **Agenci w Cursor / innych narzędziach**:

   - ESOG:
     - ma ten dokument w knowledge-base,
     - porównuje do niego każdą propozycję architektury/kodu.
   - Fix Agent:
     - używa go jako specyfikacji, co ma osiągnąć patch.
   - Główny agent:
     - może się odwoływać, gdy generuje kod / integracje (np. jak poprawnie użyć MCP z kazka).

3. **Aktualizacje**:
   - jeśli w architekturze EPIR AI zachodzą ważne zmiany (nowe Workers, nowe kanały, nowe zasady),
   - ten dokument musi zostać zaktualizowany,
   - a ESOG musi zostać przeuczony na nową wersję.

---
