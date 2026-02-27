# Audyt źródeł migracji – co przeniesiono, czego brakuje

Porównanie zawartości **asystent**, **epir_asystent**, **Landing_pages** z **aplikacja_epir**.

---

## 1. Podsumowanie (plan vs wykonanie)

| Źródło | Plan (PLAN_REFACTORYZACJI) | Wykonanie |
|--------|----------------------------|-----------|
| **epir_asystent** | workers/worker, analytics-worker, extensions | ✅ Przeniesiono |
| **epir-headless** | apps/kazka, apps/zareczyny | ✅ Przeniesiono |
| **Landing_pages** | **tylko** client_profiles, ProfileService | ✅ Przeniesiono + register_client |
| **asystent** | Całość pomijamy | ❌ Celowo nie przenosimy |
| **asystent_ADK** | Całość pomijamy | ❌ Celowo nie przenosimy |

---

## 2. epir_asystent – co przeniesiono ✅

| Element | Źródło | aplikacja_epir |
|---------|--------|----------------|
| Chat worker (logika AI, SessionDO, streaming) | workers/worker | workers/chat |
| Analytics (pixel_events, D1) | workers/analytics-worker | workers/analytics |
| RAG worker | workers/rag-worker | **Binding** – deploy z epir_asystent |
| Extensions (asystent-klienta, my-web-pixel) | extensions/ | extensions/ |

### Czego NIE przeniesiono z epir_asystent (celowo)

| Element | Powód |
|---------|-------|
| **discord-agent** | Osobny projekt – trzymamy w epir_asystent |
| **rag-worker** | Binding – deploy osobno, ten sam worker |
| **ai-worker**, **_LEGACY_** | Usunięte w refaktoryzacji |
| **hydrogen** (epir_asystent) | Używamy apps/kazka, zareczyny z epir-headless |

---

## 3. Landing_pages – co przeniesiono ✅

| Element | Źródło | aplikacja_epir |
|---------|--------|----------------|
| **ProfileService** (upsert, merge, retry) | epir-ai-worker/chat/profile.js | workers/chat/src/profile.ts |
| **client_profiles** (schema D1) | migracje | workers/chat/migrations/002 |
| **register_client** (rejestracja w czacie) | epir-ai-worker/chat/session.js | workers/chat/src/index.ts |

### Czego NIE przeniesiono z Landing_pages ⚠️

| Element | Źródło | Status | Priorytet |
|---------|--------|--------|-----------|
| **AnalyticsService** (getHotLeads, getDailyStats) | epir-ai-worker/analytics/service.js | ✅ workers/chat/src/analytics-service.ts | – |
| **Dashboard leadów** (/admin/dashboard, /admin/api/leads) | epir-ai-worker | ✅ workers/chat – endpointy + HTML | – |
| **injectChatWidget** (wstrzykiwanie widgetu w HTML) | epir-ai-worker/landing/handler.js | ❌ Brak | P3 |
| **Panel admin** (edycja landing pages, KV) | epir-landing | ❌ Brak | P3 |
| **API checkout** (POST /api/checkout) | epir-landing | ❌ Brak | P4 |
| **Landing page proxy** (kazka.epirbizuteria.pl → Hydrogen) | epir-ai-worker | ❌ Brak | P3 |

**Uwaga:** Plan refaktoryzacji przewidywał tylko client_profiles + ProfileService. Reszta (dashboard, injectChatWidget, panel admin) nie była w scope.

---

## 4. asystent (epir-ai-platform-v2)

| Element | Status |
|---------|--------|
| Całość | ❌ **Celowo nie przenosimy** – plan wyklucza asystent |

---

## 5. Co byłoby użyteczne, a nie zostało przeniesione

### Priorytet 2 – system leadów (Landing_pages)

- **getHotLeads(limit)** – lista leadów z `lead_score > 0`, sortowanie
- **getDailyStats()** – KPI: total_visitors, qualified_leads, avg_engagement
- **Dashboard /admin** – widok leadów dla sprzedawcy

**Gdzie dodać:** `workers/chat` (nowe endpointy) lub osobny worker `/admin/*`.

### Priorytet 3 – widget na landing pages

- **injectChatWidget(html, url)** – wstrzykuje widget czatu w HTML zwracany przez proxy
- Używane gdy: kazka.epirbizuteria.pl proxy’uje do Hydrogen Pages – HTML jest modyfikowany i dodawany jest widget

**Alternatywa:** Landing pages (Hydrogen) mogą mieć ChatWidget wbudowany w szablon – wtedy injectChatWidget nie jest potrzebny.

### Priorytet 3 – proxy landing pages

- **LandingPageHandler** – kazka.epirbizuteria.pl → Hydrogen Pages + injectChatWidget
- Obecnie: Hydrogen (Kazka) deployowany na Cloudflare Pages – routing odbywa się przez DNS/Pages.
- **Pytanie:** Czy kazka.epirbizuteria.pl proxy’uje przez worker, czy wskazuje bezpośrednio na Pages?

---

## 6. Weryfikacja funkcjonalna aplikacja_epir

| Funkcjonalność | Źródło | Status |
|----------------|--------|--------|
| Chat (streaming, Groq, Vision) | epir_asystent | ✅ |
| SessionDO, archiwizacja D1 | epir_asystent | ✅ |
| RAG (binding) | epir_asystent | ✅ (binding) |
| ProfileService, client_profiles | Landing_pages | ✅ |
| register_client | Landing_pages | ✅ |
| Proxy /pixel → analytics | Plan | ✅ |
| Analytics (D1, bez BigQuery streaming) | epir_asystent | ✅ |
| BigQuery batch (cron) | Nowy | ✅ |
| Hydrogen Kazka, Zareczyny | epir-headless | ✅ |
| TAE asystent-klienta | epir_asystent | ✅ |
| Web Pixel my-web-pixel | epir_asystent | ✅ |
| App Proxy | Plan | ✅ |

---

## 7. Dashboard leadów – użycie

- **URL:** `https://asystent.epirbizuteria.pl/admin/dashboard?key=ADMIN_KEY`
- **Sekret:** `wrangler secret put ADMIN_KEY` (dowolny losowy string)
- **API:** `GET /admin/api/leads` z nagłówkiem `X-Admin-Key: <ADMIN_KEY>`

---

## 8. Rekomendacje

1. **Zgodnie z planem** – przeniesiono wszystko, co było w scope.
2. **Opcjonalnie w przyszłości:**
   - Dashboard leadów (getHotLeads, getDailyStats) – jeśli sprzedawca chce widzieć gorące leady.
   - injectChatWidget – tylko jeśli landing pages są serwowane przez worker proxy (nie przez Hydrogen bezpośrednio).
