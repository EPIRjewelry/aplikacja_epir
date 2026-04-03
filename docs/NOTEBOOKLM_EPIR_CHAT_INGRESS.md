# EPIR — czat kupującego, App Proxy i Ingress (dokument dla RAG / NotebookLM)

**EPIR Chat v1 (SSOT pomocniczy):** ten plik jest **doprecyzowany pod implementację i audyt** (m.in. nazewnictwo ścieżek, pełny komunikat HMAC, status **401**, brak sztywnej listy parametrów Shopify).  
**Cel:** skondensowany opis **stanu faktycznego** w repozytorium `aplikacja_epir` (Shopify + TAE + Hydrogen + `workers/chat` + CI), do indeksowania w NotebookLM lub innym RAG.  
**Nie zastępuje** dokumentów nadrzędnych: [`EPIR_AI_ECOSYSTEM_MASTER.md`](../EPIR_AI_ECOSYSTEM_MASTER.md), [`EPIR_AI_BIBLE.md`](../EPIR_AI_BIBLE.md) — w razie sprzeczności wygrywają one.

**Zakres tego pliku:** wyłącznie przepływy HTTP związane z **czatem kupującego**, **App Proxy**, **Workerem `workers/chat`** oraz **S2S**. Nie opisuje MCP, analytics, BigQuery ani innych workerów poza minimalnym kontekstem.

### Nazewnictwo — nie mylić dwóch „chatów”

| Co                            | Pełny URL (przykład)                           | Znaczenie                                                                                                                    |
| ----------------------------- | ---------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------- |
| **Czat kupujący (App Proxy)** | `https://epirbizuteria.pl/apps/assistant/chat` | Ścieżka zasobu pod proxy: prefiks `/apps/assistant`, **ostatni segment** `chat`. To **nie** to samo co endpoint S2S poniżej. |
| **S2S tylko serwer**          | `https://asystent.epirbizuteria.pl/chat`       | Pojedynczy segment ścieżki **`/chat`** na hoście workera — **`POST /chat`**, inny kontrakt (nagłówki `X-EPIR-*`).            |

**Błąd w dokumentacji / kodzie:** pisanie ogólnie „`/chat`” bez kontekstu — może oznaczać **ostatni segment** App Proxy (`…/assistant/chat`) albo **osobny** endpoint S2S (`…/chat` na `asystent`). W audycie zawsze podawaj pełny URL lub pełną ścieżkę z prefiksem.

---

## 1. Jedna aplikacja Shopify i App Proxy

| Fakt                                                                                   | Źródło w repo                           |
| -------------------------------------------------------------------------------------- | --------------------------------------- |
| Nazwa aplikacji: **`epir_ai`**                                                         | `shopify.app.toml` → `name = "epir_ai"` |
| **`application_url`** (backend Shopify dla appki): `https://asystent.epirbizuteria.pl` | `shopify.app.toml`                      |
| App Proxy: **`prefix = "apps"`**, **`subpath = "assistant"`**                          | `shopify.app.toml` → `[app_proxy]`      |

**Konsekwencja dla URL-i widocznych przez klienta na sklepie:**

- Kanoniczna ścieżka na **domenie sklepu (Online Store):**  
  `https://{domena-sklepu}/apps/assistant/...`  
  Przykład produkcyjny: `https://epirbizuteria.pl/apps/assistant/chat`.

**Forward:** Shopify przekazuje żądanie na skonfigurowany backend (`application_url`), ze ścieżką w stylu:  
`https://asystent.epirbizuteria.pl/apps/assistant/...`  
Shopify dokleja do żądania parametry weryfikacji App Proxy (np. `shop`, `timestamp`, `signature` — **dokładne nazwy i zestaw** są opisane w oficjalnej dokumentacji Shopify _Authenticate app proxies_; **nie utrwalaj w RAG sztywnej listy** parametrów, jeśli nie cytujesz aktualnej dokumentacji).

**Nagłówki typu `X-Forwarded-For`, `X-Forwarded-Host`:** zwykle ustawia je **infrastruktura / Shopify** przy forwardzie. **Worker w `verifyAppProxyHmac` nie opiera weryfikacji HMAC na tych nagłówkach** — logika podpisu jest w `security.ts` (patrz §4.2).

---

## 2. Theme App Extension (TAE)

| Fakt                                                                         | Źródło                                            |
| ---------------------------------------------------------------------------- | ------------------------------------------------- |
| Katalog: **`extensions/asystent-klienta`**                                   | repo                                              |
| App embed: `blocks/assistant-embed.liquid`, **`target: "body"`**             | Liquid                                            |
| W schemacie: **`javascript` = `assistant.js`**                               | Liquid                                            |
| Ładowanie runtime: **`assistant.js`** to loader → **`assistant-runtime.js`** | `extensions/asystent-klienta/assets/assistant.js` |

**Repo vs żywy sklep:** repozytorium definiuje **gotowy** TAE do osadzenia. Czy blok jest **włączony w aktywnym motywie**, decyduje **Shopify Admin** — nie wynika z samego kodu w git.

---

## 3. Hydrogen — dwa storefronty

| App           | Ścieżka          | Domyślny `chatApiUrl` w kodzie (bez nadpisania `CHAT_API_URL`)                                                                                                           |
| ------------- | ---------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| **zareczyny** | `apps/zareczyny` | `https://epirbizuteria.pl/apps/assistant/chat` (z warunkiem w loaderze: użyć env tylko jeśli zawiera `/apps/assistant/chat`)                                             |
| **kazka**     | `apps/kazka`     | **`https://asystent.epirbizuteria.pl/chat`** — to jest ścieżka **`POST /chat`** na hoście workera (S2S w kontrakcie bezpieczeństwa), **nie** App Proxy na domenie sklepu |

**Uwaga dla RAG / ESOG:** ortodoksja „przeglądarka zawsze przez `https://{domena-sklepu}/apps/assistant/chat`” jest **spełniona domyślnie przez zareczyny**. **kazka** w stanie domyślnym w repo **wskazuje na `asystent…/chat`**; poprawny Ingress przez App Proxy wymaga ustawienia **`CHAT_API_URL`** na URL z `/apps/assistant/chat` na domenie sklepu (lub zmiany domyślnego w kodzie). Traktuj to jako **rozjazd repo vs docelowy kontrakt Ingressu**, do świadomej naprawy.

---

## 4. Worker `workers/chat` — dwie kluczowe trasy czatu

| Metoda i ścieżka                | Rola                                                                                                                 | Kto typowo woła                                                                                            |
| ------------------------------- | -------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------- |
| **`POST /apps/assistant/chat`** | Wejście **przez App Proxy** (po forwardzie z domeny sklepu). Walidacja **`verifyAppProxyHmac`**, potem `handleChat`. | Przeglądarka: TAE (`fetch` na domenie sklepu), Hydrogen **gdy** `chatApiUrl` wskazuje App Proxy na sklepie |
| **`POST /chat`**                | **Tylko S2S.** Walidacja **`verifyS2SChatRequest`**. **Nie** jest kanoniczną ścieżką kupującego z przeglądarki.      | Serwery / wewnętrzne systemy EPIR                                                                          |

### 4.1. Nagłówki S2S (`POST /chat`)

W kodzie (`workers/chat/src/index.ts`) wymagane są m.in.:

- `X-EPIR-SHARED-SECRET`
- `X-EPIR-STOREFRONT-ID`
- `X-EPIR-CHANNEL`

**Nigdy** w przeglądarce — sekret i kontrakt S2S nie mogą trafić do klienta.

### 4.2. Weryfikacja App Proxy (`verifyAppProxyHmac`)

Implementacja w **`workers/chat/src/security.ts`** (to jest **stan prawny** implementacji — nie uproszczony model „tylko query”):

- Podpis: nagłówek **`x-shopify-hmac-sha256`** **lub** query `signature` / `hmac`.
- Z query usuwane są przy kanonizacji klucze podpisu: `signature`, `hmac`, `shopify_hmac` (reszta parametrów trafia do stringu kanonicznego).
- **`timestamp`:** jeśli jest w query — sprawdzany (m.in. okno czasowe); brak timestampu nie jest opisany w tym dokumencie jako twardy błąd w `security.ts` (szczegóły w kodzie).
- **Komunikat pod HMAC-SHA-256:**  
  **`canonicalizeParams(wszystkie pozostałe parametry query) + surowe ciało żądania (body jako string UTF-8)`**.  
  Dla **`POST` z `Content-Type: application/json`** **ciało JSON musi być uwzględnione** w komunikacie — samo zestawienie parametrów query **nie** wystarcza do odtworzenia weryfikacji zgodnie z kodem.

**Odpowiedź przy nieudanej weryfikacji:** **`401 Unauthorized`** (w `workers/chat/src/index.ts` m.in. tekst `Unauthorized: Invalid HMAC signature`). Nie używaj ogólnego „4xx” w audycie — faktyczny kod to **401**.

**Replay (dodatkowo):** `index.ts` po udanym HMAC może stosować ochronę przed powtórzeniem podpisu (`signature` + `timestamp`) przez Durable Object — to osobna warstwa od samego `verifyAppProxyHmac`.

### 4.3. Inne trasy tego samego Workera

Ten sam worker pod `asystent.epirbizuteria.pl` obsługuje m.in. ścieżki MCP (`/apps/assistant/mcp`, itd.). **Nie zmieniają** kontraktu bezpieczeństwa dla samego czatu kupującego — ale Notebook powinien wiedzieć, że worker ≠ tylko jeden endpoint.

---

## 5. Twardy kontrakt Ingressu (ESOG) — kupujący

**Compliant (docelowo):**

- Przeglądarka → `https://{domena-sklepu}/apps/assistant/...` → Shopify App Proxy → Worker → `POST /apps/assistant/chat` (z poprawnym HMAC).

**Non-compliant:**

- `fetch` z przeglądarki do **`https://asystent.epirbizuteria.pl/chat`** (`POST /chat` bez pełnego S2S) — omija App Proxy i model Shopify.
- `fetch` z przeglądarki do **`https://asystent.epirbizuteria.pl/apps/assistant/chat`** bez prawidłowego kontekstu App Proxy (brak podpisu Shopify po stronie klienta) — typowo **nie przejdzie** `verifyAppProxyHmac`.
- Wpinanie nagłówków **`X-EPIR-*`** lub sekretów S2S w kod klienta.
- Admin API / prywatne tokeny Storefront po stronie frontu — zabronione; logika tylko na serwerze.

---

## 6. Kontekst kanału (storefront / Hydrogen) — luka w repo

- Loadery Hydrogen (np. `apps/zareczyny/app/routes/chat.tsx`) mogą zwracać **`storefrontId`** i **`channel`**.
- Komponent **`ChatWidget`** w **`@epir/ui`** (`packages/ui/src/ChatWidget.tsx`) wysyła w JSON m.in. `message`, `session_id`, `cart_id`, `brand`, `stream` — **bez** `storefrontId` / `channel` w body do `/apps/assistant/chat`.

**Skutek:** worker nie dostaje z frontu pełnego „kontraktu kontekstowego” z pól loadera; ewentualna segmentacja musi opierać się na innych sygnałach (np. shop z proxy, brand w body) — to jest **faktyczny stan kodu**, nie tylko opinia.

---

## 7. ESLint i CI — stan faktyczny

- **Root** `package.json`: tylko **`workspaces`**, **brak** skryptu `lint` w root.
- **`.github/workflows/ci.yml`** (job `lint`):  
  `working-directory: apps/${{ matrix.app }}` (macierz: `kazka`, `zareczyny`),  
  `run: npm run lint -- --config .eslintrc.cjs`

| App           | Plik konfiguracji ESLint w repo |
| ------------- | ------------------------------- |
| **zareczyny** | `apps/zareczyny/.eslintrc.cjs`  |
| **kazka**     | `apps/kazka/.eslintrc.js`       |

**Uwaga:** CI wymusza **`--config .eslintrc.cjs`** dla obu appów; **kazka** ma w repo **`.eslintrc.js`**. To jest **niespójność** — job lint dla **kazka** może kończyć się błędem „config not found”, dopóki nie wykona się jedna z akcji: np. **rename** `apps/kazka/.eslintrc.js` → `.eslintrc.cjs`, **albo** zmiana kroku CI tylko dla kazka na `--config .eslintrc.js`.

**Wzorzec zgodny z intencją CI (zareczyny — plik istnieje):**

```bash
cd apps/zareczyny && npm run lint -- --config .eslintrc.cjs
```

---

## 8. Historia konwersacji vs historia zamówień vs obietnice promptu

Sekcja **kontraktowa (ESOG):** rozdziela fakty techniczne w `workers/chat`, ograniczenia produktowe z `EPIR_AI_ECOSYSTEM_MASTER.md` oraz ryzyko rozjazdu między tekstem `luxury-system-prompt.ts` a realnym stanem kodu. Planując MVP pamięci międzysesyjnej, użyj mapy plików: [`MVP_CROSS_SESSION_MEMORY_READING_LIST.md`](MVP_CROSS_SESSION_MEMORY_READING_LIST.md).

### 8.1. Fakty techniczne: co realnie widzi model

**Źródła prawdy w repo:**

- `workers/chat/src/index.ts` — `handleChat`, `streamAssistantResponse`, klasa `SessionDO`
- testy: `workers/chat/test/session_customer.test.ts`, `workers/chat/test/session_do.test.ts`
- prompt wdrożony w workerze: `workers/chat/src/prompts/luxury-system-prompt.ts`

**Historia konwersacji (sesja)**

- Rozmowa jest identyfikowana przez `session_id` (klient utrzymuje identyfikator; worker może nadać go przez zdarzenie SSE `session`).
- Przy strumieniowaniu odpowiedzi worker pobiera historię z **SessionDO** (żądanie w stylu `https://session/history`), składa listę wiadomości, **przycina** ją (np. `slice(-MAX_HISTORY_FOR_AI)`), a do modelu trafia już ten przycięty fragment.
- **Zakres „pamięci” modelu w tym przepływie = bieżąca sesja w DO powiązana z `session_id`**, a nie automatycznie „wszystkie rozmowy użytkownika od zawsze”.

**Pamięć międzysesyjna (MVP — tylko zalogowany klient, App Proxy)**

- **Warunek:** query `logged_in_customer_id` (doklejany przez Shopify do App Proxy) — ten sam identyfikator używany w `handleChat` (`workers/chat/src/index.ts`).
- **Storage:** D1 `DB_CHATBOT`, tabela `person_memory` (`shopify_customer_id`, `summary`, `updated_at`) — migracja `workers/chat/migrations/004_person_memory.sql`. **Checklista wdrożenia produkcyjnego (migracja + deploy + smoke):** [`DEPLOYMENT_CROSS_SESSION_MEMORY_PRODUCTION.md`](DEPLOYMENT_CROSS_SESSION_MEMORY_PRODUCTION.md).
- **Odczyt:** przy starcie `streamAssistantResponse` skrót jest ładowany i dodawany jako wiadomość systemowa („zapamiętane z wcześniejszych wizyt”) — **obok** historii bieżącej sesji w SessionDO, nie zamiast niej.
- **Zapis / odświeżenie:** po zakończeniu odpowiedzi asystenta `ExecutionContext.waitUntil` wywołuje merge (krótki Groq) z aktualną historią sesji — implementacja: `workers/chat/src/person-memory.ts`.
- **Gość** (brak `logged_in_customer_id`) oraz **S2S `/chat`** bez tego parametru — **bez** tej pamięci.
- To **nie** jest pełny log wszystkich rozmów ani lista zamówień — wyłącznie skrót preferencji zgodny z MASTER (past orders nadal poza zakresem).

**Historia zamówień (past orders)**

- Shopify **nie wstrzykuje** automatycznie pełnej historii zamówień do custom workera przez App Proxy.
- Dostęp do danych zamówień wymaga **jawnej** implementacji po stronie backendu (Admin API / Storefront API / MCP) i narzędzi udostępnionych modelowi.
- Mogą istnieć **częściowe** ścieżki techniczne (np. status zamówienia przy konkretnym identyfikatorze / intencji); **nie** oznacza to domyślnie funkcji „wylistuj wszystkie moje zamówienia”.

### 8.2. Ograniczenia produktowe: co wolno obiecywać kupującemu

**Źródło prawdy:** `EPIR_AI_ECOSYSTEM_MASTER.md` — SZABLON 1 (Prompt Gemmy).

Fragment ( sens ):

- brak dostępu m.in. do **Past orders**;
- przy pytaniach w stylu _„Show me my past orders”_ / analityka / architektura — asystent musi wyjaśnić ograniczenia i wrócić do zakresu (biżuteria, polityki).

**Reguły:**

1. Asystent **nie obiecuje** listy wszystkich zamówień, analityki konwersji ani opisu architektury wewnętrznej.
2. Pytania testowe w stylu **C8** (lista zamówień) dotyczą **historii zamówień w Shopify**, a nie logu czatu w SessionDO.

### 8.3. Obietnice promptu a realna implementacja (`luxury-system-prompt.ts`)

Eksportowany prompt (`LUXURY_SYSTEM_PROMPT`) opisuje: nawiązania **w tej sesji** (SessionDO) oraz ewentualny skrót z D1 **tylko gdy** system go dosłał; bez obietnicy pełnej historii zamówień. Dłuższy blok w komentarzu (`LUXURY_SYSTEM_PROMPT_V2_FULL`) jest zsynchronizowany z tą logiką (referencja, nieeksportowany).

**Ryzyko rozjazdu:** każda zmiana w `luxury-system-prompt.ts` musi pozostawać w zgodzie z §8.1–8.2 i z faktycznym wstrzykiwaniem kontekstu w `index.ts`.

### 8.4. Reguła ESOG (podsumowanie)

1. **Jedno źródło prawdy o historii rozmowy w sesji:** SessionDO + przycinanie historii w workerze — przy zmianie kontraktu (limity, format) aktualizuj tę sekcję.
2. **Past orders:** ograniczenia z MASTER są nadrzędne; prompty PL/EN nie mogą sugerować pełnej historii zamówień bez zmiany MASTER, narzędzi i świadomej decyzji produktowej.
3. **Hierarchia spójności:** realne możliwości definiują **kod i konfiguracja**; MASTER definiuje **zakres widoczny dla kupującego**; pozostałe prompty mogą być węższe, **nie szersze** w obietnicach bez pokrycia w kodzie i MASTER.
4. **Przy zmianie** `luxury-system-prompt.ts` (lub równoważnych): sprawdź zgodność z §8.1–8.2; w razie rozbieżności — **Non-compliant** do czasu dopasowania tekstu do implementacji lub wdrożenia brakującej funkcji.

---

## 9. Checklist dla NotebookLM / ESOG (synteza)

1. **Jedna appka Shopify `epir_ai`**, App Proxy pod `/apps/assistant/*`, backend `application_url` = `asystent.epirbizuteria.pl`.
2. **Kupujący:** tylko **`https://{domena-sklepu}/apps/assistant/...`** → proxy → **`POST /apps/assistant/chat`** (pełna ścieżka — nie myl z **`/chat`** S2S; tabela w wprowadzeniu).
3. **S2S:** tylko **`POST https://asystent.epirbizuteria.pl/chat`** z nagłówkami `X-EPIR-SHARED-SECRET`, `X-EPIR-STOREFRONT-ID`, `X-EPIR-CHANNEL` — wyłącznie serwer–serwer.
4. **HMAC App Proxy:** kanoniczny string z **query (bez pól podpisu) + surowe body**; błąd weryfikacji → **401** (nie ogólne „4xx”).
5. **Parametry query Shopify:** nie inventaryzuj na sztywno — odsyłaj do dokumentacji Shopify _Authenticate app proxies_, worker kanonizuje **to, co przyjdzie** w URL (poza wykluczonymi kluczami).
6. **TAE** w repo ≠ „zawsze aktywny w theme” — weryfikacja w Adminie.
7. **zareczyny** domyślnie trzyma Ingress przez sklep; **kazka** domyślnie wskazuje `asystent…/chat` — **świadomy rozjazd** względem kontraktu Ingressu.
8. **Brak `storefrontId`/`channel` w body** `ChatWidget` — znana luka kontekstu względem loaderów.
9. **Lint:** per-app; **rozjazd kazka:** repo ma `.eslintrc.js`, CI woła `.eslintrc.cjs` — wymaga naprawy lub jawnej zmiany komendy.

---

_Dokument pomocniczy dla RAG. Aktualizuj przy zmianach w `shopify.app.toml`, `workers/chat` (zwłaszcza `security.ts`, `index.ts`, SessionDO, `luxury-system-prompt.ts`), loaderach Hydrogen lub `packages/ui/ChatWidget.tsx`._

---

## 10. Mapping storefront → worker → token → ai_profile (quick reference)

Below the mapping table that should be used when validating ingress, tokens and profile availability.

| Storefront / channel                                                            | Worker & canonical endpoint                                                                                                                                                                                                                                               |                                                                                                                                                                                                                                            Token env / fallback (where to set) | ai_profile GID (configured in code)                                                                                                                                              |
| ------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------: | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `epirbizuteria.pl` (Liquid theme, App Proxy)                                    | Cloudflare Worker `epir-art-jewellery-worker` (App Proxy ingress): `POST https://{shop}/apps/assistant/chat` → forwarded to `https://asystent.epirbizuteria.pl/apps/assistant/chat` (see `shopify.app.toml` [app_proxy])                                                  | Primary: (no per-storefront public token configured) — worker will use `SHOPIFY_STOREFRONT_TOKEN` fallback if `PUBLIC_STOREFRONT_API_TOKEN_*` not set. Set Worker secret via `wrangler secret put SHOPIFY_STOREFRONT_TOKEN` (must include `unauthenticated_read_metaobjects`). | (not configured in `STOREFRONTS`) — if you need per-storefront profile, add mapping or ensure metaobject is discoverable via metafield references. (`workers/chat/src/index.ts`) |
| `kazka` (Hydrogen) — `hydrogen-kazka`                                           | By default repo uses S2S: `POST https://asystent.epirbizuteria.pl/chat` (S2S). Optionally route via App Proxy by setting `CHAT_API_URL` to `https://{shop}/apps/assistant/chat`.                                                                                          |                                               `PUBLIC_STOREFRONT_API_TOKEN_KAZKA` (env binding in worker), fallback: `SHOPIFY_STOREFRONT_TOKEN`. Set as Cloudflare Worker secret (`wrangler secret put PUBLIC_STOREFRONT_API_TOKEN_KAZKA`) or in wrangler.toml vars for Pages. | `gid://shopify/Metaobject/2057969205580` (`workers/chat/src/index.ts` STOREFRONTS)                                                                                               |
| `zareczyny` (Hydrogen, Pages `zareczyny-hydrogen-pages`) — `hydrogen-zareczyny` | BFF flow: Browser → `POST /api/chat` (same-origin) on Pages → `apps/zareczyny` Remix route `api.chat` → proxies to `https://asystent.epirbizuteria.pl/chat` with headers `X-EPIR-SHARED-SECRET`, `X-EPIR-STOREFRONT-ID: zareczyny`, `X-EPIR-CHANNEL: hydrogen-zareczyny`. |        `PUBLIC_STOREFRONT_API_TOKEN_ZARECZYNY` + `PRIVATE_STOREFRONT_API_TOKEN_ZARECZYNY` (Pages worker secrets, private token powers ai_profile reads), fallback: `SHOPIFY_STOREFRONT_TOKEN`. Ensure Pages Secret `EPIR_CHAT_SHARED_SECRET` is set and matches worker secret. | `gid://shopify/Metaobject/2117458166092` (`workers/chat/src/index.ts` STOREFRONTS)                                                                                               |

### Prerequisites & checks (operational)

- Ensure metaobject definitions (e.g., `ai_profile`) have **Storefront API access enabled** in Shopify Admin: Settings → Custom data → Metaobjects → [definition] → Metaobject options → Storefront API access = ON. If disabled, Storefront queries return `null`. (See `apps/zareczyny/METAOBJECTS_SETUP.md` for guidance.)
- Verify Cloudflare Worker and Pages secrets:
  - Worker: `wrangler secret put PUBLIC_STOREFRONT_API_TOKEN_KAZKA` / `_ZARECZYNY` **and** `wrangler secret put PRIVATE_STOREFRONT_API_TOKEN_ZARECZYNY` (private token needed for ai_profile reads). Set `SHOPIFY_STOREFRONT_TOKEN` as fallback.
  - Pages: set `EPIR_CHAT_SHARED_SECRET` and `PUBLIC_STOREFRONT_API_TOKEN` as required in Pages → Variables and Secrets.
- To debug `ai_profile` fetches, enable transient logs in `workers/chat/src/ai-profile.ts` (log resolved GID, token prefix and `data.metaobject`) and monitor Cloudflare worker logs.

### Where this mapping lives in code

- `workers/chat/src/index.ts` — `STOREFRONTS` mapping, `resolveStorefrontConfig` logic (token fallback).
- `workers/chat/src/ai-profile.ts` — query used to fetch metaobject by GID.
- `shopify.app.toml` — App Proxy configuration (`[app_proxy] prefix = "apps", subpath = "assistant", url = "https://asystent.epirbizuteria.pl"`).
- `apps/zareczyny/app/routes/api.chat.ts` — Pages BFF proxying to worker with `X-EPIR-*` headers.

Add this table to audits and runbooks so deploy engineers verify secrets and storefront metaobject publication prior to smoke tests.
