# Sekrety i migracje – aplikacja EPIR

Dokument odpowiada na pytania: które konkretnie sekrety ustawić, o co chodzi z deploy.ps1, jak działa migracja D1.

---

## 0. Podpięcie Shopify (PRZED sekretami i deployem)

**Jeśli aplikacja nie była jeszcze podpięta** – najpierw:

```powershell
cd d:\aplikacja_epir
shopify app config link
```

- CLI zapyta o **aplikację** w Partners (np. "epir_ai") lub pozwoli utworzyć nową.
- Następnie o **dev store** (np. epir-art-silver-jewellery.myshopify.com).

Bez tego `shopify app deploy` nie zadziała. **Client secret** (SHOPIFY_APP_SECRET) bierzesz z tej samej aplikacji w Partners → App setup → Client credentials.

---

## 1. Konkretne sekrety (pełna lista)

### Chat worker (`epir-art-jewellery-worker`)

| Sekret                 | Skąd wziąć                                                                                                       | Polecenie                                                   |
| ---------------------- | ---------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------- |
| **GROQ_API_KEY**       | [console.groq.com](https://console.groq.com) → API Keys → Create                                                 | `cd workers/chat && wrangler secret put GROQ_API_KEY`       |
| **SHOPIFY_APP_SECRET** | Shopify Partners → Twoja aplikacja → **App setup** → **Client credentials** → **Client secret** (obok Client ID) | `cd workers/chat && wrangler secret put SHOPIFY_APP_SECRET` |
| **ADMIN_KEY**          | Dowolny losowy string (np. `openssl rand -hex 32`) – do Dashboard leadów                                         | `cd workers/chat && wrangler secret put ADMIN_KEY`          |

**SHOPIFY_APP_SECRET** – to **Client secret** (nie API key). Używany do weryfikacji HMAC żądań App Proxy. Bez tego chat przez App Proxy (`/apps/assistant/*`) będzie odrzucać requesty.

---

### BigQuery batch worker (`epir-bigquery-batch`)

| Sekret                  | Skąd wziąć                                                                                                                                                                                     | Polecenie                                                              |
| ----------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------- |
| **GOOGLE_CLIENT_EMAIL** | GCP Console → IAM → Service Accounts → wybierz konto → Email (np. `epir-bq@projekt.iam.gserviceaccount.com`)                                                                                   | `cd workers/bigquery-batch && wrangler secret put GOOGLE_CLIENT_EMAIL` |
| **GOOGLE_PRIVATE_KEY**  | GCP → Service Account → Keys → Add key → JSON → skopiuj **pole `private_key`** (cały blok PEM). Nazwa sekretu musi być dokładnie `GOOGLE_PRIVATE_KEY` – worker czyta `env.GOOGLE_PRIVATE_KEY`. | `cd workers/bigquery-batch && wrangler secret put GOOGLE_PRIVATE_KEY`  |
| **GOOGLE_PROJECT_ID**   | GCP Console → Dashboard → Project ID                                                                                                                                                           | `cd workers/bigquery-batch && wrangler secret put GOOGLE_PROJECT_ID`   |

**GOOGLE_PRIVATE_KEY** – wklej cały klucz tak jak jest (z `\n` z JSON – worker zamienia `\\n` na `\n`).

**Weryfikacja nazwy:** Worker (`workers/bigquery-batch/src/index.ts`) oczekuje dokładnie `env.GOOGLE_PRIVATE_KEY`. Interfejs Env: `GOOGLE_PRIVATE_KEY?: string`. Wartość to pole `private_key` z pliku JSON GCP (service account key).

---

## 2. Propozycja nr 1 – rozszerzenie deploy.ps1

**Obecny stan:** `deploy.ps1` robi:

- npm install
- deploy analytics → bigquery-batch → chat
- shopify app build + deploy

**Obecny stan deploy.ps1:** Obejmuje RAG → analytics → bigquery-batch → chat → shopify app build → shopify app deploy.

**Czego brakuje (jednorazowo):**

- Migracje D1 – trzeba wykonać ręcznie przed pierwszym deployem
- Sekrety – ręcznie przed deployem

**Hydrogen (Kazka, Zareczyny)** – deploy.ps1 **nie** deployuje ich na Cloudflare Pages; można dodać jako osobny skrypt `deploy-hydrogen.ps1` albo parametr `.\deploy.ps1 -IncludeHydrogen`.

---

## 3. Migracje D1 – jak działa, co zrobić

### Czym jest migracja D1

Migracje to pliki SQL (np. `001_*.sql`, `002_*.sql`), które tworzą tabele w bazie D1 w Cloudflare. Trzeba je wykonać **przed pierwszym deployem** workera, który z tej bazy korzysta.

### Gdzie są migracje

| Baza                         | Ścieżka migracji                     | Pliki                                                                                                                 |
| ---------------------------- | ------------------------------------ | --------------------------------------------------------------------------------------------------------------------- |
| **ai-assistant-sessions-db** | `workers/chat/migrations/`           | 001_create_analytics_schema.sql (sessions, messages, tool_calls, usage_stats, cart_activity), 002_client_profiles.sql |
| **jewelry-analytics-db**     | `workers/bigquery-batch/migrations/` | 003_batch_exports.sql                                                                                                 |

### Kolejność wykonania

```powershell
# 1. Migracje dla ai-assistant-sessions-db (używane przez chat)
cd d:\aplikacja_epir\workers\chat
wrangler d1 migrations apply ai-assistant-sessions-db --remote

# 2. Migracje dla jewelry-analytics-db (używane przez analytics + bigquery-batch)
cd d:\aplikacja_epir\workers\bigquery-batch
wrangler d1 migrations apply jewelry-analytics-db --remote
```

**Kiedy:** Jednorazowo przed pierwszym deployem. Potem – tylko gdy dodasz nowe migracje.

---

## 4. Sekrety – skrócona ściągawka

```
# Chat
cd workers/chat
wrangler secret put GROQ_API_KEY         # z console.groq.com
wrangler secret put SHOPIFY_APP_SECRET   # Client secret z Shopify Partners

# BigQuery batch
cd workers/bigquery-batch
wrangler secret put GOOGLE_CLIENT_EMAIL  # email service account
wrangler secret put GOOGLE_PRIVATE_KEY   # private_key z JSON (cały PEM)
wrangler secret put GOOGLE_PROJECT_ID    # Project ID z GCP
```

---

## Kolejność przed pierwszym deployem

1. **Migracje** (pkt 3)
2. **Sekrety** (pkt 4)
3. **deploy.ps1** (obejmuje RAG, analytics, bigquery-batch, chat, shopify)
