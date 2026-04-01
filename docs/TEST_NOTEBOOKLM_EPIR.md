# TEST WIEDZY NOTEBOOKLM — EPIR AI

**Cel:** wkleić ten dokument do NotebookLM jako prompt/zapytanie i poprosić o odpowiedzi.  
Każde pytanie ma **oczekiwaną odpowiedź** (ukrytą przed NotebookLM — do Twojej weryfikacji).  
Jeśli NotebookLM odpowie inaczej niż oczekiwano, **nie rozumie** danego aspektu systemu.

**Instrukcja dla NotebookLM:**  
> Odpowiedz na każde pytanie poniżej, cytując źródła z dokumentów EPIR. Gdzie pytanie jest wielokrotnego wyboru — wybierz jedną odpowiedź i uzasadnij. Gdzie pytanie jest otwarte — odpowiedz konkretnie, max 3 zdania. Nie zgaduj — jeśli nie masz pewności, napisz „brak danych".

---

## SEKCJA A — Architektura fundamentalna (10 pytań)

### A1. Ile aplikacji Shopify istnieje w ekosystemie EPIR?

- (a) Dwie: jedna dla czatu, jedna dla analytics
- (b) Jedna: `epir_ai`
- (c) Trzy: po jednej na każdy storefront (online-store, kazka, zareczyny)
- (d) Żadna — EPIR działa poza Shopify

<!-- OCZEKIWANA: (b) — jedna aplikacja `epir_ai`. EPIR_AI_BIBLE §1.1, ECOSYSTEM_MASTER TL;DR pkt 1, AGENTS.md -->

### A2. Jaka jest nazwa domeny `application_url` backendu aplikacji `epir_ai`?

- (a) `https://epirbizuteria.pl`
- (b) `https://epir-art-silver-jewellery.myshopify.com`
- (c) `https://asystent.epirbizuteria.pl`
- (d) `https://api.epir.pl`

<!-- OCZEKIWANA: (c) — `https://asystent.epirbizuteria.pl`. shopify.app.toml, BIBLE §1.1 -->

### A3. Jakie są prefix i subpath App Proxy skonfigurowane w `shopify.app.toml`?

- (a) `prefix = "api"`, `subpath = "chat"`
- (b) `prefix = "apps"`, `subpath = "assistant"`
- (c) `prefix = "proxy"`, `subpath = "epir"`
- (d) `prefix = "apps"`, `subpath = "epir-ai"`

<!-- OCZEKIWANA: (b) — prefix="apps", subpath="assistant". NOTEBOOKLM_EPIR_CHAT_INGRESS §1, BIBLE §1.1 -->

### A4. Ile headless storefrontów (Hydrogen) istnieje obok klasycznego Online Store?

- (a) Jeden: kazka
- (b) Jeden: zareczyny
- (c) Dwa: kazka i zareczyny
- (d) Trzy: kazka, zareczyny i dashboard

<!-- OCZEKIWANA: (c) — dwa: kazka i zareczyny. ECOSYSTEM_MASTER TL;DR, BIBLE §4–5 -->

### A5. W jakiej technologii działa backend (Chat Worker)?

- (a) Node.js na AWS Lambda
- (b) Cloudflare Workers (TypeScript)
- (c) Vercel Edge Functions
- (d) Google Cloud Run

<!-- OCZEKIWANA: (b) — Cloudflare Workers (TypeScript). BIBLE §1.2.1 -->

### A6. Jaki model embeddings używa RAG Worker?

- (a) OpenAI `text-embedding-ada-002`
- (b) `nomic-embed-text-v1.5`
- (c) Cohere `embed-english-v3.0`
- (d) `all-MiniLM-L6-v2`

<!-- OCZEKIWANA: (b) — nomic-embed-text-v1.5. BIBLE §1.2.2 -->

### A7. Jaki Durable Object odpowiada za stan pojedynczej sesji czatu?

- (a) `ChatDO`
- (b) `ConversationDO`
- (c) `SessionDO`
- (d) `StateDO`

<!-- OCZEKIWANA: (c) — SessionDO. BIBLE §1.2.1, ECOSYSTEM_MASTER -->

### A8. O której (UTC) uruchamiany jest CRON eksportujący dane z D1 do BigQuery?

- (a) 00:00 UTC
- (b) 02:00 UTC (~2:00 UTC)
- (c) 06:00 UTC
- (d) 12:00 UTC

<!-- OCZEKIWANA: (b) — ~2:00 UTC. BIBLE §1.2.4, ECOSYSTEM_MASTER -->

### A9. Jakie dwie bazy D1 istnieją w systemie?

- (a) `epir-main-db` i `epir-analytics-db`
- (b) `ai-assistant-sessions-db` i `jewelry-analytics-db`
- (c) `chat-db` i `pixel-db`
- (d) `sessions-d1` i `events-d1`

<!-- OCZEKIWANA: (b) — ai-assistant-sessions-db i jewelry-analytics-db. BIBLE §1.3 -->

### A10. Co robi `TokenVaultDO`?

- (a) Przechowuje tokeny Storefront API
- (b) Mapuje `customer_id ↔ sha256_token` dla anonimizacji (RODO)
- (c) Zarządza tokenami sesji czatu
- (d) Waliduje HMAC podpisy

<!-- OCZEKIWANA: (b) — mapowanie customer_id ↔ sha256_token, anonimizacja, RODO. BIBLE §1.2.1 -->

---

## SEKCJA B — Bezpieczeństwo i Ingress (10 pytań)

### B1. Jaki jest JEDYNY dozwolony punkt wejścia z frontendu (przeglądarki) do backendu AI?

- (a) Bezpośredni `fetch` do `https://asystent.epirbizuteria.pl/chat`
- (b) Shopify App Proxy pod `https://{domena-sklepu}/apps/assistant/...`
- (c) WebSocket do `wss://asystent.epirbizuteria.pl`
- (d) GraphQL na `https://epir-art-silver-jewellery.myshopify.com/api/graphql`

<!-- OCZEKIWANA: (b) — wyłącznie App Proxy. ECOSYSTEM_MASTER §Ingress, BIBLE §3.1, NOTEBOOKLM §5 -->

### B2. Jakim kodem HTTP odpowiada worker, gdy weryfikacja HMAC App Proxy się nie powiedzie?

- (a) 400 Bad Request
- (b) 403 Forbidden
- (c) 401 Unauthorized
- (d) 500 Internal Server Error

<!-- OCZEKIWANA: (c) — 401 Unauthorized. NOTEBOOKLM §4.2 — "nie używaj ogólnego 4xx, faktyczny kod to 401" -->

### B3. Co wchodzi w skład komunikatu (message) pod HMAC-SHA-256 w `verifyAppProxyHmac`?

- (a) Tylko parametry query
- (b) Tylko body żądania
- (c) Parametry query (bez pól podpisu) + surowe body (string UTF-8)
- (d) Nagłówki HTTP + body

<!-- OCZEKIWANA: (c) — query (bez signature/hmac/shopify_hmac) + surowe body. NOTEBOOKLM §4.2 -->

### B4. Jakie nagłówki są WYMAGANE przy żądaniu S2S `POST /chat`?

Wymień co najmniej trzy.

<!-- OCZEKIWANA: X-EPIR-SHARED-SECRET, X-EPIR-STOREFRONT-ID, X-EPIR-CHANNEL. NOTEBOOKLM §4.1 -->

### B5. Czy przeglądarka kupującego może wysyłać nagłówki `X-EPIR-SHARED-SECRET`?

- (a) Tak, jeśli jest to użytkownik zalogowany
- (b) Tak, frontend przechowuje sekret w cookie
- (c) NIE — sekrety S2S nigdy nie mogą trafić do klienta
- (d) Tak, ale tylko w trybie developerskim

<!-- OCZEKIWANA: (c) — NIGDY w przeglądarce. NOTEBOOKLM §4.1 — "Nigdy w przeglądarce" -->

### B6. Gdzie przechowywane są sekrety typu `SHOPIFY_ADMIN_ACCESS_TOKEN` i `GROQ_API_KEY`?

- (a) W pliku `.env` w repo
- (b) W `shopify.app.toml`
- (c) W wrangler secrets / env Workera (nigdy w repo ani w kliencie)
- (d) W D1

<!-- OCZEKIWANA: (c) — wrangler secrets, nigdy w repo/kliencie. BIBLE §3.2 -->

### B7. PYTANIE-PUŁAPKA: Programista proponuje, żeby Hydrogen `kazka` robił `fetch("https://asystent.epirbizuteria.pl/apps/assistant/chat")` bezpośrednio z przeglądarki (bez przejścia przez domenę sklepu). Czy to jest compliant?

- (a) Tak — to ten sam worker, więc jest OK
- (b) NIE — brak kontekstu App Proxy Shopify, HMAC nie przejdzie weryfikacji
- (c) Tak — wystarczy dodać nagłówek `Origin`
- (d) Zależy od środowiska (dev vs prod)

<!-- OCZEKIWANA: (b) — non-compliant. NOTEBOOKLM §5 "Non-compliant": fetch z przeglądarki do asystent... bez prawidłowego kontekstu App Proxy typowo nie przejdzie verifyAppProxyHmac -->

### B8. Jaka jest różnica między `POST /apps/assistant/chat` a `POST /chat` na workerze?

<!-- OCZEKIWANA: /apps/assistant/chat — wejście przez App Proxy, weryfikacja verifyAppProxyHmac, dla kupujących z przeglądarki. /chat — wyłącznie S2S, weryfikacja verifyS2SChatRequest z nagłówkami X-EPIR-*, nigdy z przeglądarki. NOTEBOOKLM §4, tabela w wprowadzeniu -->

### B9. Co chroni przed replay attack (powtórzeniem podpisu) po udanej weryfikacji HMAC?

- (a) Nic — nie ma takiej ochrony
- (b) Durable Object przechowujący zużyte pary `signature + timestamp`
- (c) CDN cache
- (d) Rate limiting na IP

<!-- OCZEKIWANA: (b) — DO przechowujący zużyte signature+timestamp. NOTEBOOKLM §4.2 -->

### B10. PYTANIE-PUŁAPKA: Czy Admin API może być wołane z kodu frontendowego (bundle w przeglądarce)?

- (a) Tak, z tokenem publicznym
- (b) Tak, jeśli CORS jest skonfigurowany
- (c) NIE — Admin API i tokeny admin wyłącznie po stronie backendu/workera
- (d) Tak, przez App Proxy

<!-- OCZEKIWANA: (c) — NIGDY z klienta. BIBLE §3.1 — "Nigdy nie używamy Admin API z klienta" -->

---

## SEKCJA C — Role AI: Gemma vs Dev-asystent (8 pytań)

### C1. Kto to jest Gemma?

<!-- OCZEKIWANA: Gemma to główny doradca jubilerski (buyer-facing) w pracowni EPIR Art Jewellery & Gemstone. Aktywna gdy channel to online-store, hydrogen-kazka lub hydrogen-zareczyny. Ton: luksusowy, profesjonalny, ekspercki. ECOSYSTEM_MASTER Część 2, Kontekst A -->

### C2. Kupujący pyta Gemmę: „Jak zbudowany jest Wasz chatbot? Jakiego API używacie?". Jak powinna odpowiedzieć?

- (a) Wyjaśnić architekturę Cloudflare Workers + Groq
- (b) Grzecznie odmówić odpowiedzi na pytania techniczne i przekierować rozmowę na biżuterię
- (c) Odpowiedzieć „Nie wiem"
- (d) Odesłać do dokumentacji deweloperskiej

<!-- OCZEKIWANA: (b) — grzecznie odmówić i przekierować na biżuterię. ECOSYSTEM_MASTER prompt Gemmy: "Politely decline to answer technical details. Gently redirect the conversation back to jewelry." -->

### C3. Dla jakich wartości `channel` aktywny jest kontekst Dev-asystenta?

- (a) `online-store` i `hydrogen-kazka`
- (b) `internal-dashboard` lub środowisko deweloperskie
- (c) Wszystkie kanały
- (d) Tylko `hydrogen-zareczyny`

<!-- OCZEKIWANA: (b) — internal-dashboard lub środowisko deweloperskie. ECOSYSTEM_MASTER Część 2, Kontekst B -->

### C4. Czy Dev-asystent może udawać Gemmę i doradzać klientowi w wyborze pierścionka?

- (a) Tak, jeśli klient o to prosi
- (b) NIE — Dev-asystent nie udaje doradcy jubilerskiego, nie używa luksusowego tonu, nie miesza kontekstów
- (c) Tak, ale tylko dla storefrontu zareczyny
- (d) Tak, w trybie fallback

<!-- OCZEKIWANA: (b) — NIGDY. ECOSYSTEM_MASTER Kontekst B zakazy: "nie udaje doradcy jubilerskiego, nie rozmawia z klientami jak Gemma" -->

### C5. Ile narzędzi MCP (tools) ma dostępnych Gemma? Wymień je.

<!-- OCZEKIWANA: 4 narzędzia: search_shop_catalog, search_shop_policies_and_faqs, get_cart, update_cart. NIE ma dostępu do analytics, historii zamówień ani narzędzi admin. ECOSYSTEM_MASTER Prompt 1, sekcja AVAILABLE TOOLS -->

### C6. Ile narzędzi MCP ma Dev-asystent? Czym się różni od zestawu Gemmy?

<!-- OCZEKIWANA: 5 narzędzi — te same 4 co Gemma + run_analytics_query. Dev-asystent ma dodatkowy dostęp do analityki BigQuery. ECOSYSTEM_MASTER Prompt 2, sekcja 3 -->

### C7. PYTANIE-PUŁAPKA: Użytkownik na panelu wewnętrznym oferuje API key Shopify. Co powinien zrobić Dev-asystent?

- (a) Przyjąć klucz i użyć go do zapytań
- (b) Poprosić o dodatkowe tokeny
- (c) Poinstruować, żeby NIE udostępniał sekretów w czacie; wyjaśnić, że MCP już obsługuje uwierzytelnianie
- (d) Zapisać klucz w D1

<!-- OCZEKIWANA: (c) — nie przyjmować, poinstruować o bezpieczeństwie. ECOSYSTEM_MASTER Prompt 2, §2.3 -->

### C8. PYTANIE-PUŁAPKA: Czy Gemma może odpowiedzieć na pytanie „Pokaż mi moje poprzednie zamówienia"?

- (a) Tak — ma narzędzie `get_order_status`
- (b) NIE — Gemma nie ma dostępu do historii zamówień ani narzędzi administracyjnych
- (c) Tak — przez `search_shop_catalog`
- (d) Tak — przez `run_analytics_query`

<!-- OCZEKIWANA: (b) — Gemma NIE ma dostępu do past orders. Prompt 1: "You DO NOT have access to: Past orders" -->

---

## SEKCJA D — Storefronty i multi-tenancy (7 pytań)

### D1. Jakie dwa parametry determinują kontekst każdego żądania czatowego?

- (a) `user_id` i `session_id`
- (b) `storefrontId` i `channel`
- (c) `shop_domain` i `api_version`
- (d) `brand` i `locale`

<!-- OCZEKIWANA: (b) — storefrontId i channel. ECOSYSTEM_MASTER §Wielomarkowość, BIBLE §3.3 -->

### D2. Wymień cztery typowe wartości `channel` w systemie EPIR.

<!-- OCZEKIWANA: online-store, hydrogen-kazka, hydrogen-zareczyny, internal-dashboard. ECOSYSTEM_MASTER §Wielomarkowość -->

### D3. Co `storefrontId` i `channel` determinują w backendzie? Wymień trzy rzeczy.

<!-- OCZEKIWANA: (1) wybór bazy wiedzy RAG, (2) wybór system promptu, (3) wybór roli agenta (Gemma vs Dev-asystent). ECOSYSTEM_MASTER §Wielomarkowość -->

### D4. PYTANIE-PUŁAPKA: Hydrogen `zareczyny` — jaki jest domyślny `chatApiUrl` w kodzie repozytorium?

- (a) `https://asystent.epirbizuteria.pl/chat`
- (b) `https://epirbizuteria.pl/apps/assistant/chat`
- (c) `https://zareczyny.epirbizuteria.pl/api/chat`
- (d) Brak domyślnego — trzeba zawsze ustawić env

<!-- OCZEKIWANA: (b) — https://epirbizuteria.pl/apps/assistant/chat (z warunkiem w loaderze). NOTEBOOKLM §3 — "zareczyny domyślnie trzyma Ingress przez sklep" -->

### D5. PYTANIE-PUŁAPKA: Hydrogen `kazka` — jaki jest domyślny `chatApiUrl` w kodzie repozytorium?

- (a) `https://epirbizuteria.pl/apps/assistant/chat`
- (b) `https://asystent.epirbizuteria.pl/chat` — ścieżka S2S, NIE App Proxy
- (c) `https://kazka.epirbizuteria.pl/api/chat`
- (d) Nie ma domyślnego

<!-- OCZEKIWANA: (b) — asystent.epirbizuteria.pl/chat. To jest ZNANY ROZJAZD — kazka domyślnie wskazuje na endpoint S2S zamiast App Proxy. Wymaga naprawy (CHAT_API_URL na URL z /apps/assistant/chat). NOTEBOOKLM §3 -->

### D6. Czy `ChatWidget` (w `packages/ui`) wysyła `storefrontId` i `channel` w body JSON do `/apps/assistant/chat`?

- (a) Tak — oba pola są w każdym żądaniu
- (b) NIE — to jest znana luka; widget wysyła message, session_id, cart_id, brand, stream, ale BEZ storefrontId/channel
- (c) Tylko `storefrontId`
- (d) Tylko `channel`

<!-- OCZEKIWANA: (b) — znana luka kontekstu. NOTEBOOKLM §6: "ChatWidget wysyła m.in. message, session_id, cart_id, brand, stream — bez storefrontId/channel w body" -->

### D7. W jaki sposób RAG rozróżnia dokumenty kazki od dokumentów zareczyny?

- (a) Osobne indeksy Vectorize
- (b) Metadata `storefront` na każdym dokumencie (np. `metadata.storefront = "kazka"`)
- (c) Oddzielne bazy D1
- (d) Nie rozróżnia — wszystko jest w jednym koszyku

<!-- OCZEKIWANA: (b) — metadata storefront na dokumentach, filtrowanie/boost przy query. BIBLE §4.3 -->

---

## SEKCJA E — Cykl danych i analytics (5 pytań)

### E1. Opisz pełny cykl życia danych sesji czatu (3 etapy).

<!-- OCZEKIWANA: (1) SessionDO — bieżący stan konwersacji in-memory, (2) D1 (ai-assistant-sessions-db) — archiwizacja wiadomości, (3) BigQuery (epir_jewelry) — eksport zanonimizowany przez bigquery-batch ~2:00 UTC. ECOSYSTEM_MASTER §Uszczelniony obieg danych, BIBLE §1.2.1 + §1.2.4 -->

### E2. Jakie zdarzenia subskrybuje Web Pixel `my-web-pixel`?

<!-- OCZEKIWANA: page_view, product_view, add_to_cart, purchase. BIBLE §1.4.2 -->

### E3. Do jakiego datasetu BigQuery trafiają eksportowane dane?

- (a) `epir_main`
- (b) `epir_jewelry`
- (c) `epir_analytics`
- (d) `shopify_data`

<!-- OCZEKIWANA: (b) — epir_jewelry. BIBLE §1.2.4 -->

### E4. Jakie dwie tabele znajdują się w BigQuery datasecie?

- (a) `sessions` i `events`
- (b) `pixel_events` i `messages`
- (c) `chats` i `analytics`
- (d) `orders` i `customers`

<!-- OCZEKIWANA: (b) — pixel_events (zdenormalizowane) i messages (zanonimizowane). BIBLE §1.2.4 -->

### E5. Co robi `RateLimiterDO`?

- (a) Limituje liczbę sesji czatu
- (b) Per-shop token bucket (np. 40 req/s) chroniący przed przekroczeniem limitów Shopify Admin API w MCP tools
- (c) Limituje rozmiar wiadomości
- (d) Blokuje spam

<!-- OCZEKIWANA: (b) — per-shop token bucket. BIBLE §1.2.1 -->

---

## SEKCJA F — TAE, CI, znane problemy (5 pytań)

### F1. Jak nazywa się katalog Theme App Extension w repo?

- (a) `extensions/chat-widget`
- (b) `extensions/asystent-klienta`
- (c) `extensions/epir-assistant`
- (d) `theme/blocks/assistant`

<!-- OCZEKIWANA: (b) — extensions/asystent-klienta. NOTEBOOKLM §2 -->

### F2. Czy obecność TAE w repo oznacza, że widget czatu jest aktywny w sklepie?

- (a) Tak — deploy = aktywacja
- (b) NIE — o aktywacji decyduje Shopify Admin (czy blok jest włączony w aktywnym motywie)
- (c) Tak — po `shopify app deploy` jest automatycznie włączony
- (d) Zależy od pliku konfiguracji

<!-- OCZEKIWANA: (b) — repo definiuje TAE, ale aktywacja zależy od Admina. NOTEBOOKLM §2: "Repo vs żywy sklep: czy blok jest włączony, decyduje Shopify Admin" -->

### F3. Jaka jest znana niespójność ESLint w CI dla aplikacji `kazka`?

<!-- OCZEKIWANA: CI wymusza --config .eslintrc.cjs dla obu appów, ale kazka ma w repo .eslintrc.js (nie .cjs). Job lint dla kazka może kończyć się błędem "config not found". Naprawa: rename na .eslintrc.cjs lub zmiana komendy CI. NOTEBOOKLM §7 -->

### F4. Jaki jest loader w TAE: co robi `assistant.js`?

- (a) Zawiera pełną logikę czatu
- (b) Jest loaderem, który ładuje `assistant-runtime.js`
- (c) Wyświetla tylko ikonę czatu
- (d) Łączy się bezpośrednio z Groq API

<!-- OCZEKIWANA: (b) — assistant.js to loader, który ładuje assistant-runtime.js. NOTEBOOKLM §2 -->

### F5. PYTANIE FINALNE: Co powinien zrobić ESOG (strażnik ortodoksji), gdy widzi naruszenie? Czy naprawia kod?

- (a) Tak — ESOG naprawia i commituje
- (b) NIE — ESOG tylko wskazuje naruszenia, priorytetyzuje (MUST/SHOULD/NICE-TO-HAVE), linkuje do zasad. Naprawy implementuje Fix Agent pod kontrolą ESOG
- (c) ESOG ignoruje drobne naruszenia
- (d) ESOG zgłasza issue na GitHubie

<!-- OCZEKIWANA: (b) — ESOG nigdy nie naprawia kodu, tylko recenzuje. Fix Agent implementuje. BIBLE §6.1 + §6.2 -->

---

## SEKCJA G — Pytania otwarte scenariuszowe (5 pytań)

### G1. SCENARIUSZ: Nowy developer klonuje repo na świeżym laptopie. Jakie trzy dokumenty powinien przeczytać najpierw i w jakiej kolejności?

<!-- OCZEKIWANA: 1) EPIR_AI_ECOSYSTEM_MASTER.md, 2) EPIR_AI_BIBLE.md, 3) docs/README.md. AGENTS.md definiuje tę kolejność. -->

### G2. SCENARIUSZ: Ktoś proponuje postawienie „drugiego backendu" obok Chat Workera, żeby obsługiwał kazka oddzielnie. Czy to jest zgodne z architekturą?

<!-- OCZEKIWANA: NIE. AGENTS.md: "Nie projektuj równoległych backendów. Jedno repo, jedna aplikacja, jeden backend." BIBLE §1: "Nie ma drugiej aplikacji, forka czatu ani równoległego backendu." Multi-tenancy realizowana przez storefrontId/channel, nie przez oddzielne backendy. -->

### G3. SCENARIUSZ: Frontend developer chce dodać `SHOPIFY_ADMIN_ACCESS_TOKEN` do zmiennych środowiskowych Hydrogen `zareczyny`, żeby ładować produkty szybciej. Czy to dozwolone?

<!-- OCZEKIWANA: ABSOLUTNIE NIE. Admin API token nigdy w bundlu/kliencie. Frontend może tylko używać Storefront API (public/private token) przez createStorefrontClient. BIBLE §3.1: "Nigdy nie używamy Admin API z klienta, tokenów admin w bundlu." -->

### G4. SCENARIUSZ: Worker zwraca odpowiedź 401 na żądanie czatu z przeglądarki. Podaj trzy możliwe przyczyny.

<!-- OCZEKIWANA: (1) Brak prawidłowego HMAC — żądanie nie przeszło przez App Proxy Shopify. (2) Nieprawidłowy/wygasły timestamp (okno czasowe). (3) Replay attack — ta sama para signature+timestamp została już użyta (DO). NOTEBOOKLM §4.2 -->

### G5. SCENARIUSZ: Shopify zmienia zestaw parametrów query przekazywanych przez App Proxy. Czy worker się zepsuje?

<!-- OCZEKIWANA: NIE powinien — worker kanonizuje "to, co przyjdzie" w URL (poza wykluczonymi kluczami signature/hmac/shopify_hmac). Nie opiera się na sztywnej liście parametrów. NOTEBOOKLM §4.2 + §8 pkt 5: "nie inventaryzuj na sztywno — odsyłaj do docs Shopify, worker kanonizuje to, co przyjdzie" -->

---

## Klucz oceny

| Wynik | Interpretacja |
|-------|---------------|
| 45/45 (100%) | NotebookLM rozumie EPIR w pełni |
| 38–44 (85–97%) | Dobra znajomość, drobne luki — sprawdź, które pytania zawiodły |
| 30–37 (67–84%) | Poważne luki — prawdopodobnie NotebookLM nie zaindeksował wszystkich dokumentów |
| < 30 (< 67%) | NotebookLM **nie rozumie** aplikacji — przeindeksuj dokumenty bazowe |

### Które pytania są krytyczne (MUST PASS)?

Jeśli NotebookLM odpowie źle na **którekolwiek** z poniższych, **nie można mu ufać**:

- **A1** (jedna aplikacja)
- **B1** (jedyny ingress = App Proxy)
- **B5** (sekrety S2S nigdy w przeglądarce)
- **B7** (bezpośredni fetch non-compliant)
- **B10** (Admin API nigdy z klienta)
- **C2** (Gemma odmawia pytań technicznych)
- **C4** (Dev-asystent nie udaje Gemmy)
- **D1** (storefrontId + channel)
- **D5** (kazka rozjazd repo)
- **D6** (brak storefrontId/channel w ChatWidget — znana luka)

---

*Wygenerowano z: `EPIR_AI_ECOSYSTEM_MASTER.md`, `EPIR_AI_BIBLE.md`, `NOTEBOOKLM_EPIR_CHAT_INGRESS.md`, `AGENTS.md`.*
