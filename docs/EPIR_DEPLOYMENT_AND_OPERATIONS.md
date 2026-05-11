# EPIR Deployment and Operations

## Cel

Ten dokument scala w jednym miejscu wymagania operacyjne: sekrety, migracje, kolejność deployu, Pages i podstawową checklistę weryfikacji.

## Zakres środowiska

Komponenty objęte tym dokumentem:

- `workers/chat`
- `workers/rag-worker`
- `workers/analytics`
- `workers/bigquery-batch`
- `apps/kazka`
- `apps/zareczyny`
- aplikacja Shopify `epir_ai`

## Wymagania wstępne

- działający dostęp do Cloudflare (`wrangler login` lub token API),
- Shopify CLI powiązany z właściwą aplikacją i sklepem,
- Node.js / npm zgodne z projektem,
- uprawnienia do ustawiania secrets i deployu workers / pages.

## Sekrety i konfiguracja

### Profile środowisk `staging` / `production` w `wrangler.toml` (4 workery)

Aktualny stan repo dla:

- `workers/chat/wrangler.toml`
- `workers/rag-worker/wrangler.toml`
- `workers/analytics/wrangler.toml`
- `workers/bigquery-batch/wrangler.toml`

Każdy plik definiuje sekcje `[env.staging]` i `[env.production]` jako profile dziedziczące konfigurację top-level (bindingi, sekrety, triggery/routy), bez jawnych override'ów w samych sekcjach env.

Kontrakt operacyjny:

- środowisko jest rozróżniane nazwą profilu (`--env staging` / `--env production`) oraz sekretami i ustawieniami utrzymywanymi po stronie Cloudflare,
- brak override w `[env.*]` jest intencjonalny; nie traktujemy tego jako brak konfiguracji,
- wszelkie różnice między staging i production dodajemy tylko wtedy, gdy są wymagane i jawnie uzasadnione release'em.

Wymóg polityki deploy:

- `workers_dev` nie może być `true` w root ani w `[env.production]` (walidowane przez `scripts/ci/validate-wrangler-prod-policy.py` dla workerów objętych polityką).

### `workers/chat`

Wymagane sekrety backendowe:

- `AI_GATEWAY_TOKEN` (nagłówek `cf-aig-authorization` do AI Gateway; model Groq idzie przez gateway, nie przez `Authorization: Bearer` z kluczem Groq)
- `SHOPIFY_APP_SECRET`
- `EPIR_CHAT_SHARED_SECRET`
- `ADMIN_KEY` (jeśli używany przez dashboard / admin flow)
- tokeny storefrontów używane przez worker, zależnie od konfiguracji:
  - `SHOPIFY_STOREFRONT_TOKEN`
  - `PUBLIC_STOREFRONT_API_TOKEN_KAZKA`
  - `PUBLIC_STOREFRONT_API_TOKEN_ZARECZYNY`
  - `PRIVATE_STOREFRONT_API_TOKEN_ZARECZYNY`

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

- `GOOGLE_CLIENT_EMAIL`
- `GOOGLE_PRIVATE_KEY`
- `GOOGLE_PROJECT_ID`
- `ADMIN_KEY` (wymagany dla `POST /internal/analytics/query`)

Postura ingress dla produkcji:

- `workers_dev = false` (brak publicznej domeny developerskiej dla workera batch),
- endpoint `POST /internal/analytics/query` jest traktowany jako internal-only i musi wymagać poprawnego `ADMIN_KEY`.

### `workers/analytics`

Wymagane sekrety backendowe:

- `SHOPIFY_WEBHOOK_SECRET`
- `ADMIN_KEY` (dla chronionych endpointów odczytu)

Postura ingress dla produkcji:

- endpointy `GET /pixel/events`, `GET /journey`, `GET /sessions` nie mogą być publicznie dostępne; wymagają poprawnego `ADMIN_KEY` (fail-closed).

### Kontrakt service binding (chat -> analytics/bigquery)

- `workers/chat` komunikuje się z `workers/analytics` i `workers/bigquery-batch` wyłącznie przez service bindings (`ANALYTICS_WORKER`, `BIGQUERY_BATCH`),
- nie utrzymujemy fallbacków do publicznych adresów `*.workers.dev` dla ruchu internal.

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
4. `workers/chat` (**musi obejmować trasy Consent Gate:** `POST /apps/assistant/consent`, `POST /consent` oraz zapis do `consent_events` po zastosowaniu migracji D1)

W praktyce `deploy.ps1` powinien utrzymywać tę kolejność.

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
- eksport batch do BigQuery,
- spójność `session_id` / `_epir_session_id`, jeśli dotyczy.

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
| 5 | Sekrety `workers/chat` | ustawione w środowisku produkcyjnym: `AI_GATEWAY_TOKEN`, `SHOPIFY_APP_SECRET`, `EPIR_CHAT_SHARED_SECRET`, `ADMIN_KEY`, oraz token storefrontu pasujący do `SHOP_DOMAIN` (`SHOPIFY_STOREFRONT_TOKEN` lub odpowiedni per-storefront token) |
| 6 | Sekrety `workers/rag-worker` | `ADMIN_TOKEN` ustawiony i **nie jest placeholderem** z repo; `CANONICAL_MCP_URL`, `SHOP_DOMAIN` ustawione; bindingi `AI`, `VECTOR_INDEX` widoczne dla workera |
| 7 | Sekrety `workers/analytics` | `SHOPIFY_WEBHOOK_SECRET`, `ADMIN_KEY` ustawione |
| 8 | Sekrety `workers/bigquery-batch` | `GOOGLE_CLIENT_EMAIL`, `GOOGLE_PRIVATE_KEY`, `GOOGLE_PROJECT_ID`, `ADMIN_KEY` ustawione |
| 9 | Sekrety Cloudflare Pages (`kazka`, `zareczyny`) | `SESSION_SECRET`, `PUBLIC_STOREFRONT_API_TOKEN`, `PRIVATE_STOREFRONT_API_TOKEN` (gdzie wymagany), `PUBLIC_CUSTOMER_ACCOUNT_API_CLIENT_ID`, `EPIR_CHAT_SHARED_SECRET` ustawione w obu projektach Pages |
| 10 | Migracja D1 `ai-assistant-sessions-db` | `005_consent_events.sql` zaaplikowana (`wrangler d1 execute ai-assistant-sessions-db --remote --file=./migrations/005_consent_events.sql` z katalogu `workers/chat`); tabela `consent_events` istnieje |
| 11 | Migracje D1 `jewelry-analytics-db` | wszystkie aktualne pliki migracyjne z `workers/bigquery-batch` zaaplikowane na bazę docelową |

### Faza 3. Postura ingress i fail-closed (przed-deploy guard)

Każda pozycja w tej fazie ma być sprawdzona na zdeployowanej (lub planowanej) konfiguracji workera. Nie wolno polegać na publicznych URL `*.workers.dev` dla internal ruchu.

| # | Endpoint / kontrakt | Warunek PASS |
|----|---------------------|--------------|
| 12 | `workers/rag-worker` `POST /admin/upsert` | fail-closed: brak / placeholder / niepoprawny `ADMIN_TOKEN` ⇒ `401` |
| 13 | `workers/bigquery-batch` `POST /internal/analytics/query` | `workers_dev = false` w `wrangler.toml`; brak `ADMIN_KEY` ⇒ `401` |
| 14 | `workers/analytics` `GET /pixel/events`, `GET /journey`, `GET /sessions` | brak `ADMIN_KEY` ⇒ `401` (żaden z tych endpointów nie jest publicznie dostępny) |
| 15 | `workers/chat` S2S `POST /chat`, `POST /consent` | brak `X-EPIR-SHARED-SECRET` ⇒ `401`; brak `storefrontId` lub `channel` ⇒ `400` |
| 16 | `workers/chat` App Proxy `POST /apps/assistant/chat`, `POST /apps/assistant/consent` | błędny / brakujący HMAC ⇒ `401` (weryfikowane przez `workers/chat/src/security.ts`) |
| 17 | Service binding chat → analytics / bigquery | `workers/chat/wrangler.toml` definiuje bindingi `ANALYTICS_WORKER` i `BIGQUERY_BATCH`; **brak** fallbacku po publicznym `*.workers.dev` w kodzie ruchu internal |

### Faza 4. Deploy w kanonicznej kolejności

| # | Krok | Warunek PASS |
|----|------|--------------|
| 18 | `workers/rag-worker` deploy | `wrangler deploy` zakończony 200; `GET /health` zwraca 200 z produkcyjnej domeny workera |
| 19 | `workers/analytics` deploy | `wrangler deploy` zakończony; bindingi i sekrety widoczne; brak publicznego dostępu do chronionych endpointów (zob. poz. 14) |
| 20 | `workers/bigquery-batch` deploy | `wrangler deploy` zakończony; `workers_dev` pozostaje `false` po deployu (zob. poz. 13) |
| 21 | `workers/chat` deploy | uruchamiany **po** poz. 10 i poz. 18–20; obejmuje trasy `POST /chat`, `POST /consent`, `POST /apps/assistant/chat`, `POST /apps/assistant/consent` |
| 22 | `shopify app deploy` | TAE `asystent-klienta` (z Consent Gate w assetach) + App Proxy `prefix=apps`, `subpath=assistant` zsynchronizowane z workerem |
| 23 | Cloudflare Pages deploy | `apps/kazka` → `kazka-hydrogen-pages` (`--branch=main`); `apps/zareczyny` → `zareczyny-hydrogen-pages` (`--branch=main`); obie aplikacje serwują trasy `api.chat.ts` i `api.consent.ts` |

### Faza 5. Smoke testy po deployu

#### Automatyczna bramka CI po deployu workerów (fail-closed)

Po sukcesie joba `deploy-workers` w `.github/workflows/deploy.yml` uruchamiany jest job `post-deploy-smoke`, który wykonuje `node scripts/smoke/post-deploy-smoke.mjs` (syntetyczne żądania HTTP — ok. kilku minut, deterministyczny exit code ≠ 0 przy dowolnej porażce).

| Sekret repozytorium GitHub | Znaczenie |
|----------------------------|-----------|
| `SMOKE_BASE_URL` | Origin workera czatu HTTPS (bez końcowego `/`), ten sam host co ingress produkcyjny / staging (np. `https://asystent.epirbizuteria.pl`). Używany do `POST /apps/assistant/chat`, `POST /chat`, `POST /pixel`, `GET /pixel/events` (ostatnie dwa przez proxy z workera czatu na `workers/analytics`). |
| `SMOKE_RAG_HEALTH_URL` | Pełny URL `GET /health` workera `epir-rag-worker` (repo nie zawiera trasy DNS dla RAG — adres ustala się po stronie Cloudflare, np. domena workera lub inny jawny endpoint). |
| `SMOKE_ANALYTICS_ADMIN_KEY` | Wartość zgodna z sekretem `ADMIN_KEY` w `workers/analytics` ( Bearer do `GET /pixel/events`). Wymagany w CI dla pełnego testu persystencji D1; lokalnie można ustawić `SKIP_D1_VERIFY=1` i pominąć ten sekret — wtedy sprawdzane jest wyłącznie `POST /pixel` ⇒ 200. |

Weryfikacja D1 w tej bramce odbywa się **przez HTTP** (`GET /pixel/events`), nie przez `wrangler d1 execute` (token Cloudflare nadal jest potrzebny do deployu workerów).

| # | Ścieżka / dane | Warunek PASS |
|----|----------------|--------------|
| 24 | Online Store (TAE) | `POST {shop}/apps/assistant/consent` po wyrażeniu zgody ⇒ **2xx** (typowo **204**); `POST {shop}/apps/assistant/chat` ⇒ odpowiedź `Content-Type: text/event-stream` |
| 25 | Hydrogen `kazka` | `POST /api/consent` ⇒ **204**; `POST /api/chat` ⇒ `text/event-stream`; BFF dokleja `X-EPIR-SHARED-SECRET`, `X-EPIR-STOREFRONT-ID`, `X-EPIR-CHANNEL` |
| 26 | Hydrogen `zareczyny` | jak poz. 25, z odpowiednim `storefrontId` / `channel` |
| 27 | D1 `consent_events` | nowy wiersz append-only dla każdego pomyślnego zapisu zgody (potwierdzone `wrangler d1 execute ai-assistant-sessions-db --remote --command="SELECT * FROM consent_events ORDER BY created_at DESC LIMIT 5;"`) |
| 28 | RAG retrieval | `GET /health` ⇒ 200; `POST /search/policies` i `POST /search/products` zwracają wyniki dla referencyjnego zapytania; `ADMIN_TOKEN` nie jest placeholderem |
| 29 | Analytics pipeline | webhooki Shopify trafiają do D1 `jewelry-analytics-db`; batch eksport do BigQuery dostarcza partycję dnia; spójność `_epir_session_id` ↔ `session_id` zachowana w lejku |
| 30 | Negatywny smoke (no-go canary) | powtórzenie poz. 12, 13, 14, 15 na produkcyjnym workerze — każda zwraca `401`/`400` zgodnie z kontraktem (potwierdzone z poziomu klienta bez sekretu) |

### Reguła blokady

- **PASS = wszystkie pozycje 1–30 spełnione.** Jakikolwiek FAIL ⇒ **NO-GO**, niezależnie od jego „wagi”. Nie przepuszczamy bramki pojedynczym wyjątkiem ani notatką „dopiszemy w hotfixie”.
- Nowy sekret, endpoint, migracja albo check CI musi być dopisany do tej checklisty **przed** release, w którym staje się wymagany. Niezdokumentowana zależność jest traktowana jako FAIL.
- Bramka jest jedna i jest tutaj. Nie utrzymujemy „roboczych” checklist w PR, issue ani notatkach prywatnych.

## Zasady utrzymania

1. Nie opisujemy deployu w kilku równoległych dokumentach.
2. Każda zmiana w kolejności wdrożenia, secretach lub bindingach aktualizuje ten plik.
3. Jeśli operacyjny stan różni się od repo, repo wymaga korekty — nie odwrotnie.
4. Runbook operacyjny ma pozostać krótki i wykonywalny, bez checkpointów historycznych i bez notatek „tymczasowych”.
5. Bramka go/no-go z sekcji powyżej jest jedynym formalnym źródłem decyzji release; rozszerzenia kontraktu security/CI najpierw trafiają do tej checklisty, a dopiero potem do narzędzi automatyzacji.
