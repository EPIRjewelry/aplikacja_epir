# Przepływ danych: piksel → raport operatora

**Status:** zsynchronizowane z kodem w repo (2026-09-29). To nie jest drugi kanon. Wiążący kontrakt: [`EPIR_ANALYTICS_DATA_CONTRACT.md`](EPIR_ANALYTICS_DATA_CONTRACT.md); mapa EDOG: [`EPIR_DATA_FLOW_MAP.md`](EPIR_DATA_FLOW_MAP.md).

Bazy:

| D1 | database (prod, z mapy) | Binding |
|----|-------------------------|---------|
| `jewelry-analytics-db` | piksel, watermark, steward | `DB` na `epir-analityc-worker`, `epir-bigquery-batch`, `epir-store-steward` |
| `ai-assistant-sessions-db` | czat, raport operatora | `DB_CHATBOT` na `epir-art-jewellery-worker` i `epir-bigquery-batch` |

---

## 1. Kroki po kolei

### A. Capture piksela

1. **Skąd:** Web Pixel `extensions/my-web-pixel`. Zdarzenie Shopify wychodzi tylko gdy `event.context.customerPrivacy.analyticsProcessingAllowed === true`. Brak zgody = cichy `return` (bez fetch).
2. **Tożsamość:** cookie `_epir_session_id`, a gdy puste — `clientId` z eventu. Puste oba → `session_id: ""` w body; worker zapisuje **`NULL`** w D1 (bez losowego `session_*`), log `console.error`. Wklejka Customer Events (`extensions/my-web-pixel/storefront-custom-pixel.js`) nie czyta ciasteczka: gdy `event.clientId` jest puste, bierze `init.clientId`, potem `init.data.clientId`, i wpisuje wartość w `data.sessionId`, `data.session_id` oraz `data.clientId`. Worker czyta te pola w tej kolejności i **nie** czyta nagłówka `Cookie`.
3. **HTTP:** `POST {pixelEndpoint}/pixel` z body `{ type, data }` (`session_id`, `customerId`, `storefront_id`, `channel`, atrybucja).
4. **Przyjmuje:** `epir-art-jewellery-worker` (`workers/chat`). Każdy `/pixel*` idzie service bindingiem `ANALYTICS_WORKER` na `https://analytics.internal/pixel…`. Brak bindingu → HTTP 503 `pixel_proxy_not_configured`.
5. **Zapisuje:** `epir-analityc-worker` `POST /pixel` i `POST /pixel/events` → `handlePixelPost`.

Tabele w `jewelry-analytics-db` (jedno zdarzenie, trzy zapisy):

| Tabela | Klucz | Łączy się przez |
|--------|-------|-----------------|
| `pixel_events` | `id` TEXT (runtime: `timestamp*1000 + los 0–999`) | `session_id`, `customer_id`, `order_id` |
| `customer_events` | `id` INTEGER AUTOINCREMENT | `(customer_id, session_id)` |
| `customer_sessions` | `PRIMARY KEY (customer_id, session_id)` | licznik zdarzeń, flaga czatu |

`created_at` w `pixel_events` jest **ISO TEXT** (`new Date().toISOString()`), mimo że DDL ma `TEXT DEFAULT datetime('now')` i kontrakt dopuszcza też INTEGER ms.

`customer_id` pusty → literał `anonymous`. **Kto ustawia `_epir_session_id`:** landing Ads (`workers/dynamic-landing-liquid`) generuje cookie; Hydrogen (Kazka/Zaręczyny) **czyta** cookie do atrybutu koszyka, ale go nie tworzy; na **apex** (Online Store) wcześniej nikt — snippet [`epir-session-cart-attr.liquid`](../themes/epir-online-store/snippets/epir-session-cart-attr.liquid) ustawia cookie = `_epir_session_id` albo `_shopify_y` (Shopify `clientId`, to samo co Web Pixel fallback) i synchronizuje atrybut koszyka. Czat preferuje istniejący `epir-assistant-session` w `sessionStorage` dla **nowych** rozmów.

### B. Czat (równoległa ścieżka, join po `session_id`)

1. **Skąd:** Gemma / BFF → `POST /chat` albo App Proxy `/apps/assistant/chat` na `epir-art-jewellery-worker`.
2. **Gorący stan:** Durable Object `SessionDO`. Tabela `messages` **w DO nie ma `session_id`** — sesja to tożsamość DO. Kolumny: `id` INTEGER PK, `role`, `content`, `ts`, `tool_calls`, `tool_call_id`, `name`, `message_uid`.
3. **Archiwum:** `persistMessageRow` → D1 `ai-assistant-sessions-db.messages`. Wiersz **nie jest zapisywany**, gdy brak `DB_CHATBOT` albo brak `message_uid` (cichy `return`).
4. Snapshot sesji: `sessions` (`session_id` TEXT PK) z `customer_id`, `storefront_id`, `channel`.

Join hurtowni Q1 zakłada ten sam `session_id` (`_epir_session_id`). EDOG liczy **chat↔pixel match rate** (24 h); brak zgodności → FAIL.

### C. Zamówienie

`POST /webhooks/orders/create` na analytics (HMAC Shopify albo `X-EPIR-FLOW-SECRET`) → `order_attributions`.

| Kolumna | Rola |
|---------|------|
| `shopify_order_gid` | PK (`admin_graphql_api_id` albo `gid://shopify/Order/{id}`) |
| `order_name` | nazwa zamówienia |
| `epir_session_id` | z `note_attributes` / `custom_attributes` klucza `_epir_session_id` |
| `source` | `webhook_orders_create` |
| `received_at` | INTEGER ms |

Eksport do pixel stream (gdy `PIPELINE_EXPORT_EXTENDED_FIELDS=true` **i** zaktualizowany pipeline SQL w Cloudflare): wiersze `order_attributions` z niepustym `epir_session_id` → `event_type = order_attributed`, `id = order:{shopify_order_gid}`. Q1/Q7 traktują `order_attributed` jak zakup obok `purchase_completed` / `checkout_completed`. Domyślnie flaga wyłączona — tylko D1.

Inne webhooki w tym samym workerze, też tylko D1: `checkout_abandoned` → `customer_events`; VIP → `customer_vip` (PK `customer_id`).

### D. Eksport D1 → Pipelines → Iceberg

Worker `epir-bigquery-batch`, cron **`0 2 * * *` UTC** (`runWarehouseExportCatchUp`, do 12 przebiegów, cel `pending ≤ 1000`).

Watermark: `jewelry-analytics-db.batch_exports` — jeden wiersz `id = 1`.

| Kolumna | Znaczenie |
|---------|-----------|
| `last_pixel_export_at` | INTEGER ms (kursor czasu) |
| `last_pixel_export_id` | TEXT — drugi składnik kursora `(ms, id)` |
| `last_messages_export_at` / `last_orders_export_at` | INTEGER ms |
| `last_orders_export_id` | TEXT (zamówienia / `order_attributed`) |
| `updated_at` | czas ostatniego przebiegu |

- Pixel: `WHERE (ms, id) > (watermark)` z `julianday` dla ISO `created_at`; `ORDER BY ms, id`; `mapPixelRowToPipelineRecord` (+ opcjonalnie zamówienia).
- Messages: kursor `(timestamp, id)`; błąd chunka → `pipelineError`, **bez** podbicia watermarku.
- Brak `PIPELINE_MESSAGES_INGEST_URL` → EDOG **FAIL** (`pipeline_messages_not_configured`).
- Błąd chunka piksela: częściowy postęp kursora, `pipelineError` w podsumowaniu.

Sink (szablon w repo, nie prod ID): `workers/bigquery-batch/pipelines-schemas/pixel-pipeline-production.example.sql` → Iceberg `analytics.epir_pixel_events_raw`. Messages: 1:1 stream → `analytics.messages_raw`.

Odczyt: RPC `BigQueryBatchS2SRpc.runAnalyticsQuery`, whitelist `Q1`–`Q10` (`analytics-queries.ts`). HTTP `POST /internal/analytics/query` zwraca 404.

### E. Raport operatora

Cron **`0 9 * * *` UTC** na `epir-bigquery-batch` → `runOperatorDailyReport`:

1. `buildFlowHealthReport` (ten sam werdykt co flow-health).
2. Skrót Gemmy z D1: `messages` gdzie `role='user'`, `timestamp` ≥ 24 h, `channel` pusty albo ≠ `operator`, plus `sessions` po `session_id`.
3. Q8 (`Q8_DAILY_EVENTS`) **tylko gdy** `edog_verdict === 'PASS'`. Inaczej w markdown jest „Pominięto Q8”.
4. `MARKETING_INGEST_RPC.getMarketingPreview()` — snippet JSON, osobny namespace marketing, nie piksel.
5. `INSERT` do `ai-assistant-sessions-db.operator_daily_reports` (`report_date` TEXT PK, nadpisanie tego samego dnia).
6. Opcjonalny POST na `GWORKSPACE_REPORT_WEBHOOK_URL` (PII maskowane). Pusty URL = nic.

Odczyt w Operator Studio (klucz `EPIR_OPERATOR_PANEL_SECRET`):

- `GET /internal/operator-studio/api/operator-report/latest`
- `GET /internal/operator-studio/api/reports`
- `GET /internal/operator-studio/api/reports/{YYYY-MM-DD}`

Studio **nie liczy** raportu. Czyta wiersz zapisany przez cron.

Osobno, nie w tym raporcie: `GET /admin/api/leads` (hot leads z `DB_CHATBOT`). Leady nie mają klucza w eksporcie hurtowni.

### F. Steward (osobny produkt, nie krok raportu)

`epir-store-steward`, cron **`0 4 * * *` UTC**, albo RPC `runAggregation` (Studio: `POST …/steward/aggregate`). HTTP `/internal/steward` na tym workerze = 404.

Czyści plaster `period_start`/`period_end`, potem:

1. `aggregatePixelSignals` — SQL wprost na `pixel_events` (lejek, produkt, atrybucja).
2. `aggregateHamSignals` — ten sam D1, reguły HAM.
3. `fetchWarehouseSignals` — RPC Q2, Q4, Q5, Q7, Q8. Brak RPC = pusta lista, bez błędu werdyktu.
4. `deriveInsights` → `steward_insights`. Odczyt: `getInsights` / `GET …/steward/insights`.

Błąd crona jest tylko `console.error`. Nie pisze `operator_daily_reports`.

### G. CQRS wykresów (obok raportu)

`epir-analityc-worker` cron **`30 3 * * *` UTC** odpala workflow `WAREHOUSE_CQRS_WF` → tabela serwująca `warehouse_serving_daily` (PK logiczny `snapshot_date`). Studio tego nie składa w raport dzienny. Brak bindingu workflow = cichy skip.

---

## 2. Schematy i klucze łączenia

### `pixel_events` (`jewelry-analytics-db`)

PK: `id` TEXT.

Pola, które niosą następny krok: `session_id`, `customer_id` (albo `anonymous`), `event_type`, `created_at` (ISO), `page_url`, `product_id`, `product_handle`, `order_id`, `storefront_id`, `channel`, `traffic_source` / `traffic_medium` / `traffic_campaign`, `click_id`. Reszta (heatmap, koszyk, `raw_data`) zostaje w D1; **nie** jedzie jako kolumny streamu.

### `customer_events` / `customer_sessions`

PK: autoincrement oraz `(customer_id, session_id)`. Czas: `event_timestamp` / `first_event_at` INTEGER ms. Nie ma eksportera do Iceberg. Gemma journey czyta je przez RPC (`/journey`, `/sessions`), nie przez Q1–Q10.

### `order_attributions`

PK: `shopify_order_gid`. Join do piksela tylko ręcznie po `epir_session_id` = `pixel_events.session_id`. Brak `customer_id`.

### `sessions` + `messages` (`ai-assistant-sessions-db`)

- `sessions.session_id` TEXT PK → `messages.session_id`, `customer_id`, `storefront_id`, `channel`.
- `messages.id` INTEGER AUTOINCREMENT. Idempotencja: `message_uid` UNIQUE (`006_idempotent_persistence.sql`).
- Czas archiwum: `messages.timestamp` INTEGER ms (w DO kolumna nazywa się `ts`).
- Eksport streamu: `id`, `session_id`, `role`, `content`, `timestamp`, `tool_calls`, `tool_call_id`, `name`, `storefront_id`, `channel`. **Bez** `message_uid`.

### `batch_exports`

PK: `id` INTEGER, zawsze `1`.

### Iceberg (odczyt R2 SQL)

`analytics.epir_pixel_events_raw` — kolumny, których wymagają Q1–Q10: `session_id`, `event_type`, `created_at`, `page_url`. Q1 łączy z `analytics.messages_raw` po **`session_id`**. Messages: `session_id`, `role`, `content`, `"timestamp"`, `name`.

Stream (repo): `id`, `timestamp` (ms), `page_url`, pola produktu/UTM; przy `PIPELINE_EXPORT_EXTENDED_FIELDS` też `customer_id`, `order_id`. Sink: `created_at` = `FROM_UNIXTIME(timestamp/1000)`. **Prod:** zaktualizuj SQL pipeline + schemat streamu z [`pixel-pipeline-production.sql`](../workers/bigquery-batch/pipelines-schemas/pixel-pipeline-production.sql) przed włączeniem flagi; migracja D1 [`004_batch_export_cursor.sql`](../workers/bigquery-batch/migrations/004_batch_export_cursor.sql).

### `operator_daily_reports`

PK: `report_date` (`YYYY-MM-DD` UTC). Brak klucza sesji — to jeden dokument markdown + `edog_verdict`.

### Steward (`jewelry-analytics-db`)

| Tabela | PK | Klucz okresu |
|--------|----|----------------|
| `store_signals` | `id` TEXT (`sig…` / `wh…`) | `(period_start, period_end)` + `signal_key` |
| `steward_insights` | `id` TEXT | ten sam okres |
| `steward_reports` | `id` TEXT | markdown z RPC, nie cron raportu operatora |

Sygnał D1 niesie `product_id` / `product_handle` / `storefront_id`. Sygnał hurtowni niesie tylko `row_count` i 5 wierszy próbki — bez joinu do zamówienia.

---

## 3. Ryzyka operacyjne (po poprawkach w repo)

1. **Deploy Cloudflare przed flagą** — bez nowego pipeline SQL / schematu streamu włączenie `PIPELINE_EXPORT_EXTENDED_FIELDS` może odrzucać rekordy lub pisać złe kolumny.
2. **Liquid apex** — snippet [`epir-session-cart-attr.liquid`](../themes/epir-online-store/snippets/epir-session-cart-attr.liquid) trzeba podłączyć w `layout/theme.liquid` (lokalnie; `theme push` tylko po OK operatora).
3. **Historyczne wiersze** — stare `session_*` z losowego generatora zostają w D1; nowe zdarzenia bez sesji = `NULL` (EDOG DEGRADED gdy >5% NULL / 24 h).
4. **`customer_id`** — nadal bez pełnej normalizacji GID między pixel a webhookami; extended export niesie surowe wartości z D1.
5. **Pixel fetch** — błędy sieci nadal cicho w `catch` w kliencie; brak zdarzenia ≠ NULL w D1.
6. **`updated_at` watermarku** rusza się także przy eksporcie 0 wierszy. Świeży batch nie znaczy, że wiersze doszły do Iceberg.
7. **Q8 w raporcie** odpada przy werdykcie innym niż PASS. Raport i tak się zapisuje — wygląda na kompletny, sekcja hurtowni jest pusta z jednego zdania.
8. **Steward TIME_FILTER** porównuje INTEGER ms albo TEXT z `datetime(cutoff)`. ISO z `toISOString()` (z `T` i `Z`) nie jest tym samym co `datetime()`. Część wierszy może nie wejść w sygnał, bez wyjątku.
9. **Leady** (`/admin/api/leads`) i **pamięć klienta** nie są w tym łańcuchu.
10. **Historyczny backlog pixel** — gdy `pending_pixel_events` ≥ 10 000 i kursor `last_pixel_export_at` jest wielomiesięcznie w tyle, sam catch-up (12×2500/wywołanie) nie zejdzie z progu FAIL w jednej nocy. Opcja operacyjna na workerze `epir-bigquery-batch`: `WAREHOUSE_PIXEL_HISTORY_TRIAGE_ENABLED=true` + `WAREHOUSE_PIXEL_TRIAGE_KEEP_DAYS=7` — po catch-up **forward skip** watermarka na granicę (now − 7 dni) **bez** ingestu pominiętych wierszy (audit: log `watermark_history_triage`). D1 zostaje; w Icebergu jest świadoma luka; nowsze dni idą normalnym eksportem. **Nie** resetuj watermarka przy `read_error` (`export_aborted_watermark_unread`). Ręczny `UPDATE batch_exports` kursora na `0` odtwarza cały backlog — unikać po wdrożeniu #106.

---

## 4. Co sprawdza flow-health, czego nie sprawdza steward

### Flow-health

Kod: `buildFlowHealthReport` + `computeEdogVerdict` w `workers/bigquery-batch`. Cron **08:00 i 20:00 UTC** (monitor) oraz fragment raportu o 09:00. Studio: `GET /internal/operator-studio/api/flow-health` → RPC `getFlowHealth`. HTTP `/internal/flow-health` na batchu jest wycofany (404 / deprecated).

**Sprawdza:**

| Sygnał | Skutek |
|--------|--------|
| `PIPELINE_PIXEL_INGEST_URL` / `PIPELINE_MESSAGES_INGEST_URL` | brak → FAIL |
| `pending_pixel_events` (kursor `(ms,id)`) | &lt; 0 FAIL; ≥ 10 000 FAIL; ≥ 1 000 DEGRADED |
| `d1_pixel_events_24h` / `d1_messages_24h` = -1 | FAIL (licznik niedostępny) |
| `batch_exports.updated_at` | brak / 0 → FAIL; ≥ 48 h FAIL; ≥ 26 h DEGRADED |
| `pixel_null_session_rate_24h` &gt; 5% | DEGRADED |
| `chat_pixel_session_match` (24 h) | 0% → FAIL; niski % przy ≥ min sesji → DEGRADED |
| `pixel_events` w 24 h = 0 i pending = 0 | DEGRADED `no_pixel_events_24h` |
| Sonda Q1 (tylko gdy batch nie jest krytyczny) | błąd → FAIL; 0 wierszy → DEGRADED; D1 24 h &gt; 0 i `total_pixel_sessions = 0` → FAIL `warehouse_pixel_empty` |

Q1 liczy sesje czatu z `role='user'`, sesje zakupu po `event_type`, join po `session_id`, oraz `approx_distinct(session_id)` na całej tabeli pixel.

**Nie sprawdza:**

- czy każdy chunk messages faktycznie trafił do Iceberg (tylko konfiguracja URL + D1),
- zgodności prod pipeline SQL ze schematem w repo,
- `order_attributions` poza eksportem `order_attributed` (gdy flaga wyłączona),
- zgody piksela (ciche dropy),
- leadów,
- treści raportu operatora i webhooka Workspace,
- stewarda, CQRS `warehouse_serving_daily`,
- poprawności SQL pipeline w Cloudflare (prod SQL nie jest w gicie).

`DEGRADED` w API bramka EDOG traktuje jak FAIL ([`docs/kb/DATA_AND_ANALYTICS.md`](kb/DATA_AND_ANALYTICS.md)).

### Steward

**Sprawdza (agreguje, nie wystawia EDOG):**

- liczniki `pixel_events` w oknie lookback (domyślnie 7 dni): typ zdarzenia, sesje, widoki produktu vs dodanie do koszyka vs checkout, scroll, czas,
- sygnały HAM z tego samego D1,
- czy RPC Q2/Q4/Q5/Q7/Q8 zwraca wiersze (zapisuje `row_count` + 5 wierszy próbki).

**Nie sprawdza:**

- watermarku, pending, wieku batcha, werdyktu EDOG,
- czy pipeline w ogóle przyjął wiersze (poza pośrednio pustym Q*),
- `messages` / Q1 / Q3 / Q6 / Q9 / Q10,
- `order_attributions` i GID zamówienia,
- `operator_daily_reports`,
- pustego RPC (brak bindingu = zero sygnałów hurtowni, cron idzie dalej),
- własnego błędu crona poza logiem.

`getInsights` bez nowych argumentów czyta ostatni zapisany okres. Nie odpala agregacji.

---

## 5. Testy

### Jest test

| Krok | Plik |
|------|------|
| Zgoda piksela, cookie `_epir_session_id`, payload POST | `extensions/my-web-pixel/src/index.test.ts` |
| Wklejka Customer Events: `event.clientId`, potem `init.clientId` | `extensions/my-web-pixel/src/custom-pixel-payload.test.ts` |
| `POST /pixel` → kolumny D1, heatmap, URL, UTM, webhook zamówienia / abandoned / VIP | `workers/analytics/src/index.test.ts` |
| Mapowanie wiersza D1 → rekord streamu (kształt kodu, nie kontrakt §2) | `workers/bigquery-batch/src/pixel-pipeline-record.test.ts` |
| `pixelCreatedAtMs` / ISO | `d1-timestamps.test.ts` |
| POST ingest HTTP (2xx / błąd / pusty URL) | `pipeline-ingest.test.ts` |
| Werdykt EDOG (progowe liczby, bez D1) | `edog-flow-health.test.ts` |
| Narracja powodów | `edog-reason-narrative.test.ts` |
| SQL Q1–Q10 (dialekt, brak `DISTINCT`) | `analytics-queries.test.ts` |
| Parser odpowiedzi R2 SQL | `r2-sql-client.test.ts` |
| Pętla catch-up (mock) | `warehouse-export-catchup.test.ts` |
| Triage backlogu pixel / forward watermark | `warehouse-watermark-triage.test.ts` |
| Markdown raportu, webhook, maska PII, digest Gemmy (render) | `operator-daily-report.test.ts`, `operator-daily-report.webhook.test.ts`, `operator-gemma-digest.test.ts`, `report-pii-mask.test.ts` |
| Odczyt listy raportów w Studio (mock D1) | `workers/chat/test/operator_studio_ingress.test.ts` |
| Reguły insightów stewarda (czyste funkcje) | `workers/store-steward/src/index.test.ts` |
| CI kolumn kontraktu | `python scripts/ci/validate-data-contract.py` |

### Nie ma testu ścieżki

- Proxy `epir-art-jewellery-worker` `/pixel` → `ANALYTICS_WORKER` (w `workers/chat/test` brak `/pixel`).
- `persistMessageRow` / warunek `message_uid` / rozjazd `ts` vs `timestamp` (brak testu archiwum DO→D1 w tym łańcuchu).
- `exportPixelEvents` / `exportMessages` na prawdziwym D1: LIMIT, błąd chunka messages, przesuwanie watermarku.
- Gubienie zdarzeń z tej samej sekundy przez próg `unixepoch`.
- Zgodność `mapPixelRowToPipelineRecord` z `pixel-events-stream.schema.json` i z przykładowym SQL (`id = 0`).
- Równość `session_id` piksela i czatu oraz join Q1 na fixture obu tabel.
- `order_attributions` → lejek (świadomie poza eksportem; brak testu, który by to wykrył).
- Cron 02:00 / 09:00 end-to-end aż do `INSERT operator_daily_reports`.
- `buildFlowHealthReport` z D1 (testy pokrywają samą funkcję werdyktu).
- `aggregatePixelSignals` / `fetchWarehouseSignals` / cron stewarda (test jest tylko na `deriveInsights` i okresie).
- CQRS `30 3 * * *` → `warehouse_serving_daily` jako część raportu (osobne testy wykresów HTTP, nie łańcuch do operatora).
