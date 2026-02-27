# Podsumowanie pracy nad aplikacją EPIR – droga do produkcji

**Projekt:** `d:\aplikacja_epir\`  
**Cel:** Jedna aplikacja produkcyjna (chat, analityka, Hydrogen, extensions) zastępująca poprzednie rozwiązania.

---

## 1. Co zostało zrobione

### Struktura (Faza 0–1)
- [x] Workspace z `apps/`, `workers/`, `extensions/`, `packages/`
- [x] **apps/kazka** – Hydrogen
- [x] **apps/zareczyny** – Hydrogen
- [x] **workers/chat** – chat worker
- [x] **workers/rag-worker** – RAG worker (Vectorize, MCP, embeddings)
- [x] **workers/analytics** – analytics worker
- [x] **workers/bigquery-batch** – eksport do BigQuery (cron 2:00 UTC)
- [x] **extensions/asystent-klienta** – Theme App Extension (widget czatu)
- [x] **extensions/my-web-pixel** – Web Pixel Extension
- [x] **shopify.app.toml** – jedna aplikacja Shopify

### Chat worker (Faza 2)
- [x] SessionDO, RateLimiterDO, TokenVaultDO
- [x] Archiwizacja do D1 (limit 200 wiadomości)
- [x] Vision (image_base64, llama-3.2-11b-vision)
- [x] ProfileService, register_client
- [x] Proxy `/pixel` → analytics worker
- [x] Bez AI_WORKER, SESSIONS_KV

### Analytics worker (Faza 3)
- [x] Tylko D1 (bez BigQuery streaming)
- [x] Service binding z chat workera (proxy /pixel)

### BigQuery batch (Faza 4)
- [x] Cron, eksport pixel_events i messages
- [x] Migracje D1 (batch_exports)

### Hydrogen (Faza 5)
- [x] CHAT_API_URL → worker
- [x] ChatWidget z konfigurowalnym endpointem

### Extensions (Faza 6)
- [x] worker_endpoint w asystent-klienta
- [x] pixelEndpoint w my-web-pixel
- [x] App Proxy w shopify.app.toml

### Dokumentacja i skrypty
- [x] `docs/DEPLOYMENT_EPIR.md` – instrukcje deployu
- [x] `deploy.ps1` / `deploy.sh` – skrypty wdrożenia

---

## 2. Co trzeba dopiąć przed produkcją

### 2.1 Cloudflare – D1 i migracje

| Krok | Opis |
|------|------|
| **Utworzenie D1** | Jeśli nie istnieją: `wrangler d1 create jewelry-analytics-db`, `wrangler d1 create ai-assistant-sessions-db` |
| **Migracje chat** | `cd workers/chat && wrangler d1 migrations apply ai-assistant-sessions-db --remote` (001, 002) |
| **Migracje bigquery** | `cd workers/bigquery-batch && wrangler d1 migrations apply jewelry-analytics-db --remote` (003) |

ID baz (już w wrangler.toml):
- `jewelry-analytics-db`: `6a4f7cbb-3c1c-42c7-9d79-4ef74d421f23`
- `ai-assistant-sessions-db`: `475a1cb7-f1b5-47ba-94ed-40fd64c32451`

### 2.2 Sekrety (wrangler secret put)

| Worker | Sekrety |
|--------|---------|
| **chat** | `GROQ_API_KEY`, `SHOPIFY_APP_SECRET` |
| **bigquery-batch** | `GOOGLE_CLIENT_EMAIL`, `GOOGLE_PRIVATE_KEY`, `GOOGLE_PROJECT_ID` |

### 2.3 RAG worker (krytyczne)

Chat worker ma binding do `epir-rag-worker`. RAG jest w `aplikacja_epir/workers/rag-worker`. **Deploy.ps1** deployuje go przed chat workerem.

### 2.4 Cloudflare Pages – Hydrogen (Kazka, Zareczyny)

Skrypt `deploy.ps1` **nie** deployuje Hydrogen. Trzeba dodać:

```bash
# Kazka
cd apps/kazka
npm run build
wrangler pages deploy public --project-name=kazka-hydrogen-pages

# Zareczyny
cd apps/zareczyny
npm run build
wrangler pages deploy public --project-name=zareczyny-hydrogen-pages
```

**Sekrety w Cloudflare Pages** (Settings → Variables and Secrets):
- `SESSION_SECRET`
- `PUBLIC_STOREFRONT_API_TOKEN`
- `PRIVATE_STOREFRONT_API_TOKEN`
- `PUBLIC_CUSTOMER_ACCOUNT_API_CLIENT_ID`

**Zmienna opcjonalna:** `PUBLIC_STOREFRONT_API_VERSION` (np. `2025-10`) – jawna wersja Storefront API. Domyślnie w kodzie: `2025-10`.

### 2.5 DNS i routes

- Domena `epirbizuteria.pl` w Cloudflare
- Subdomeny: `kazka.epirbizuteria.pl`, `zareczyny.epirbizuteria.pl` → Cloudflare Pages
- Route `asystent.epirbizuteria.pl/*` → chat worker (już w wrangler.toml)

### 2.6 Shopify

| Krok | Opis |
|------|------|
| **App Proxy** | W Shopify Admin → Settings → Apps → Agent EPIR → App proxy: subpath `assistant`, URL `https://asystent.epirbizuteria.pl` |
| **Extensions** | `shopify app deploy` wgrywa extensions |
| **Ustawienia extensions** | W Theme Editor: worker_endpoint (asystent-klienta), pixelEndpoint (my-web-pixel) – domyślnie `https://asystent.epirbizuteria.pl` |

---

## 3. Kolejność wdrożenia (zalecana)

```
1. D1: utworzenie baz (jeśli brak) + migracje
2. Sekrety: chat (GROQ, SHOPIFY_APP_SECRET), bigquery-batch (Google)
3. deploy.ps1: RAG → analytics → bigquery-batch → chat → shopify app build + deploy
4. Hydrogen: build + pages deploy (Kazka, Zareczyny)
5. Weryfikacja: asystent.epirbizuteria.pl/chat, pixel, extensions
```

---

## 4. Zastąpienie poprzednich aplikacji

| Poprzednie | Nowe | Uwagi |
|------------|------|-------|
| epir-chat-worker (epir-headless) | epir-art-jewellery-worker | Chat worker w aplikacja_epir |
| epir-ai-worker, ai-worker | – | Usunięte, logika w chat workerze |
| analytics-worker (streaming BigQuery) | epir-analityc-worker | Tylko D1, batch do BigQuery |
| Stare extensions | asystent-klienta, my-web-pixel | W shopify.app.toml |
| Stare Hydrogen (osobne projekty) | apps/kazka, apps/zareczyny | W tym samym repo |

**Przełączenie:** Po weryfikacji nowej aplikacji:
1. Wyłączyć stare workers (lub zmienić routes)
2. Przełączyć DNS na nowe Pages (jeśli zmiana)
3. W Shopify: odinstalować starą aplikację (jeśli inna), upewnić się, że nowa ma extensions

---

## 5. Ryzyka i mitygacja

| Ryzyko | Mitygacja |
|--------|-----------|
| Utrata danych | Backup D1 przed migracją |
| Downtime | Deploy równolegle, przełączenie po testach |
| RAG worker niedostępny | Deploy RAG przed chat, test binding |
| Konflikty Shopify | Test na dev store przed produkcją |

---

## 6. Szybki start – pełny deploy

```powershell
# 1. Migracje (jednorazowo)
cd d:\aplikacja_epir\workers\chat
wrangler d1 migrations apply ai-assistant-sessions-db --remote

cd d:\aplikacja_epir\workers\bigquery-batch
wrangler d1 migrations apply jewelry-analytics-db --remote

# 2. Główny deploy (obejmuje RAG, analytics, bigquery-batch, chat, shopify)
cd d:\aplikacja_epir
.\deploy.ps1

# 3. Hydrogen (ręcznie)
cd apps\kazka && npm run build && wrangler pages deploy public --project-name=kazka-hydrogen-pages
cd ..\zareczyny && npm run build && wrangler pages deploy public --project-name=zareczyny-hydrogen-pages
```

---

## 7. Kontakt / dalsze kroki

- **Dokumentacja:** `docs/DEPLOYMENT_EPIR.md`
- **Plan refaktoryzacji:** `docs/PLAN_REFACTORYZACJI_EPIR.md`
- **Opcjonalnie:** Dodać Hydrogen do `deploy.ps1`, aby jeden skrypt robił pełny deploy
