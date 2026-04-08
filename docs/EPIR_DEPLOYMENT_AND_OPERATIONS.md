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
- dane pomocnicze chat runtime.

### `jewelry-analytics-db`

Rola:

- eventy analityczne,
- logi eksportów,
- storage dla analytics pipeline.

## Kolejność migracji

1. `workers/chat` → `ai-assistant-sessions-db`
2. `workers/bigquery-batch` → `jewelry-analytics-db`

Wykonuj migracje przed pierwszym pełnym deployem i później wyłącznie wtedy, gdy pojawiają się nowe pliki migracyjne.

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
4. `workers/chat`

W praktyce `deploy.ps1` powinien utrzymywać tę kolejność.

### 5. Deploy aplikacji Shopify

Po workerach uruchom build i deploy aplikacji Shopify, aby zsynchronizować extensions i konfigurację App Proxy.

### 6. Deploy storefrontów headless

Zbuduj i wdroż:

- `apps/kazka`
- `apps/zareczyny`

na Cloudflare Pages.

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

## Zasady utrzymania

1. Nie opisujemy deployu w kilku równoległych dokumentach.
2. Każda zmiana w kolejności wdrożenia, secretach lub bindingach aktualizuje ten plik.
3. Jeśli operacyjny stan różni się od repo, repo wymaga korekty — nie odwrotnie.
4. Runbook operacyjny ma pozostać krótki i wykonywalny, bez checkpointów historycznych i bez notatek „tymczasowych”.
