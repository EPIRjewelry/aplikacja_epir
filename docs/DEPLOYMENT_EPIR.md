# Instrukcja wdrożenia EPIR – Faza 7

> [!IMPORTANT]
> To jest **dokument operacyjny / pomocniczy**.
> Najpierw przeczytaj dokumenty nadrzędne:
>
> - `../EPIR_AI_ECOSYSTEM_MASTER.md`
> - `../EPIR_AI_BIBLE.md`
>
> Ten plik opisuje **wdrożenie infrastruktury i konfiguracji**, a nie pełny model architektury ani reguły orthodoksji.

Dokument opisuje kroki wdrożenia infrastruktury Cloudflare (D1, Workers, Routes, App Proxy) oraz sekretów dla aplikacji EPIR Art Jewellery.

---

## 7.1 D1: Utworzenie baz danych

### Wymagane bazy

| Baza                       | Opis                                   | Binding      |
| -------------------------- | -------------------------------------- | ------------ |
| `jewelry-analytics-db`     | Pixel events, batch_exports, analytics | `DB`         |
| `ai-assistant-sessions-db` | Sesje czatu, messages, client_profiles | `DB_CHATBOT` |

### Utworzenie baz

```bash
# Z głównego katalogu projektu (d:\aplikacja_epir)
cd workers/chat

# Utworzenie jewelry-analytics-db
wrangler d1 create jewelry-analytics-db

# Utworzenie ai-assistant-sessions-db
wrangler d1 create ai-assistant-sessions-db
```

### Aktualizacja wrangler.toml

Po utworzeniu baz skopiuj zwrócone `database_id` do plików `wrangler.toml`:

- **workers/chat/wrangler.toml** – obie bazy
- **workers/analytics/wrangler.toml** – `DB` (jewelry-analytics-db)
- **workers/bigquery-batch/wrangler.toml** – obie bazy

Obecne ID (już skonfigurowane):

- `jewelry-analytics-db`: `6a4f7cbb-3c1c-42c7-9d79-4ef74d421f23`
- `ai-assistant-sessions-db`: `475a1cb7-f1b5-47ba-94ed-40fd64c32451`

---

## 7.2 Migracje D1 – kolejność apply

Migracje są rozdzielone między dwie bazy. **Kolejność ma znaczenie.**

### Baza: ai-assistant-sessions-db

Migracje: `001`, `002` (w `workers/chat/migrations/`)

```bash
cd workers/chat
wrangler d1 migrations apply ai-assistant-sessions-db --remote
```

| Migracja | Tabele                                                     |
| -------- | ---------------------------------------------------------- |
| 001      | sessions, messages, tool_calls, usage_stats, cart_activity |
| 002      | client_profiles                                            |

### Baza: jewelry-analytics-db

Migracje: `003` (w `workers/bigquery-batch/migrations/`)

```bash
cd workers/bigquery-batch
wrangler d1 migrations apply jewelry-analytics-db --remote
```

| Migracja | Tabele        |
| -------- | ------------- |
| 003      | batch_exports |

**Uwaga:** Tabela `pixel_events` jest tworzona automatycznie przez analytics worker przy pierwszym uruchomieniu (`ensurePixelTable`). Nie wymaga migracji D1.

### Kolejność wykonania

1. `workers/chat` → `ai-assistant-sessions-db` (001, 002)
2. `workers/bigquery-batch` → `jewelry-analytics-db` (003)

---

## 7.3 Routes: asystent.epirbizuteria.pl → chat worker

### Konfiguracja

Chat worker (`epir-art-jewellery-worker`) obsługuje subdomenę asystenta:

```toml
# workers/chat/wrangler.toml
[[routes]]
pattern = "asystent.epirbizuteria.pl/*"
zone_name = "epirbizuteria.pl"
```

### Wymagania

1. Domena `epirbizuteria.pl` musi być w Cloudflare (DNS w tym samym koncie).
2. Subdomena `asystent.epirbizuteria.pl` – rekord CNAME lub A (Cloudflare proxy).
3. Po deploymencie: `https://asystent.epirbizuteria.pl/chat` powinien odpowiadać.

### Weryfikacja

```bash
cd workers/chat
wrangler deploy
# Sprawdź w Cloudflare Dashboard → Workers & Pages → epir-art-jewellery-worker → Settings → Triggers → Routes
```

---

## 7.4 App Proxy: /apps/assistant/\* → chat worker

App Proxy kieruje żądania z Shopify (`https://epir-art-silver-jewellery.myshopify.com/apps/assistant/*`) na chat workera.

### Konfiguracja w shopify.app.toml

```toml
[app_proxy]
url = "https://asystent.epirbizuteria.pl"
subpath = "assistant"
prefix = "apps"
```

Efekt: `https://epir-art-silver-jewellery.myshopify.com/apps/assistant/chat` → `https://asystent.epirbizuteria.pl/apps/assistant/chat`

### Kroki w Shopify Admin

1. Zaloguj się do **Shopify Admin** → **Settings** → **Apps and sales channels**.
2. Wybierz aplikację **epir_ai**.
3. Przejdź do **App setup** / **App proxy**.
4. Upewnij się, że:
   - **Subpath prefix:** `apps`
   - **Subpath:** `assistant`
   - **Proxy URL:** `https://asystent.epirbizuteria.pl`
5. Zapisz zmiany.

### Weryfikacja

- `shopify app deploy` aktualizuje konfigurację App Proxy.
- Test: `https://epir-art-silver-jewellery.myshopify.com/apps/assistant/chat` (z tokenem HMAC).

---

## 7.5 Sekrety (wrangler secret put)

### Chat worker (epir-art-jewellery-worker)

```bash
cd workers/chat
wrangler secret put GROQ_API_KEY
wrangler secret put SHOPIFY_APP_SECRET
```

### BigQuery batch worker (epir-bigquery-batch)

```bash
cd workers/bigquery-batch
wrangler secret put GOOGLE_CLIENT_EMAIL
wrangler secret put GOOGLE_PRIVATE_KEY
wrangler secret put GOOGLE_PROJECT_ID
```

### Podsumowanie sekretów

| Worker         | Sekret                | Opis                                   |
| -------------- | --------------------- | -------------------------------------- |
| chat           | `GROQ_API_KEY`        | Klucz API Groq (LLM)                   |
| chat           | `SHOPIFY_APP_SECRET`  | Client secret aplikacji Shopify (HMAC) |
| bigquery-batch | `GOOGLE_CLIENT_EMAIL` | Service account email (BigQuery)       |
| bigquery-batch | `GOOGLE_PRIVATE_KEY`  | Klucz prywatny (PEM)                   |
| bigquery-batch | `GOOGLE_PROJECT_ID`   | ID projektu GCP                        |

---

## Spójność wrangler.toml (weryfikacja)

| Worker         | Plik                                 | jewelry-analytics-db | ai-assistant-sessions-db | Routes                       |
| -------------- | ------------------------------------ | -------------------- | ------------------------ | ---------------------------- |
| chat           | workers/chat/wrangler.toml           | ✓ DB                 | ✓ DB_CHATBOT             | asystent.epirbizuteria.pl/\* |
| analytics      | workers/analytics/wrangler.toml      | ✓ DB                 | –                        | workers_dev                  |
| bigquery-batch | workers/bigquery-batch/wrangler.toml | ✓ DB                 | ✓ DB_CHATBOT             | workers_dev (cron)           |

**database_id (spójne we wszystkich workerach):**

- `jewelry-analytics-db`: `6a4f7cbb-3c1c-42c7-9d79-4ef74d421f23`
- `ai-assistant-sessions-db`: `475a1cb7-f1b5-47ba-94ed-40fd64c32451`

**Uwaga:** Chat worker ma service binding do `epir-rag-worker`. Ten worker musi być zdeployowany osobno (może być w innym repo, np. epir_asystent).

---

## Skrypt deploy

Użyj `deploy.ps1` (Windows) lub `deploy.sh` (Linux/macOS) z katalogu głównego projektu.
