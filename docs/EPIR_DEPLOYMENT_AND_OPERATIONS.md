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

### `workers/chat`

Wymagane sekrety backendowe:

- `GROQ_API_KEY`
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

### `workers/bigquery-batch`

- `GOOGLE_CLIENT_EMAIL`
- `GOOGLE_PRIVATE_KEY`
- `GOOGLE_PROJECT_ID`

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
| **Gałąź referencyjna** | `stable/storefront-2026-04` (ten sam commit co tag) |

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

## Zasady utrzymania

1. Nie opisujemy deployu w kilku równoległych dokumentach.
2. Każda zmiana w kolejności wdrożenia, secretach lub bindingach aktualizuje ten plik.
3. Jeśli operacyjny stan różni się od repo, repo wymaga korekty — nie odwrotnie.
4. Runbook operacyjny ma pozostać krótki i wykonywalny, bez checkpointów historycznych i bez notatek „tymczasowych”.
