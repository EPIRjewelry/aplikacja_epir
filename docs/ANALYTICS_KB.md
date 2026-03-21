# EPIR Analytics Knowledge Base

> [!IMPORTANT]
> To jest **dokument domenowy / pomocniczy**.
> Najpierw przeczytaj dokumenty nadrzędne:
>
> - `../EPIR_AI_ECOSYSTEM_MASTER.md`
> - `../EPIR_AI_BIBLE.md`
>
> Ten plik opisuje warstwę analityczną i zapytania, ale nie jest nadrzędnym źródłem prawdy dla całego repo.

Dokumentacja źródeł danych analitycznych, mapowania pól i kanonicznych zapytań dla Agent Analityk. Opiera się na [Shopify Web Pixels API Standard Events](https://shopify.dev/docs/api/web-pixels-api/standard-events).

---

## 1. Źródła danych

### 1.1 events_raw (BigQuery)

Tabela `analytics_435783047.events_raw` – eksport z D1 `pixel_events` (nocny batch o 2:00 UTC).

**Źródło:** Web Pixel (`my-web-pixel`) → Analytics Worker → D1 `pixel_events` → BigQuery Batch.

**Mapowanie eventów:** `my-web-pixel` korzysta z **Standard Events** zdefiniowanych w [Web pixel standard events reference](https://shopify.dev/docs/api/web-pixels-api/standard-events). Payload wysyłany do Analytics Workera ma mapowanie 1:1 (lub świadomie ograniczone) względem tych eventów.

**Pełna lista 25 typów zdarzeń śledzonych w EPIR:**

| #   | event_type                         | Kategoria | Opis                                |
| --- | ---------------------------------- | --------- | ----------------------------------- |
| 1   | `page_viewed`                      | Standard  | Wyświetlenie strony                 |
| 2   | `product_viewed`                   | Standard  | Wyświetlenie produktu               |
| 3   | `cart_viewed`                      | Standard  | Wyświetlenie koszyka                |
| 4   | `cart_updated`                     | Standard  | Aktualizacja koszyka                |
| 5   | `product_added_to_cart`            | Standard  | Dodanie do koszyka                  |
| 6   | `product_removed_from_cart`        | Standard  | Usunięcie z koszyka                 |
| 7   | `collection_viewed`                | Standard  | Wyświetlenie kolekcji               |
| 8   | `search_submitted`                 | Standard  | Wyszukiwanie                        |
| 9   | `checkout_started`                 | Standard  | Rozpoczęcie checkoutu               |
| 10  | `checkout_completed`               | Standard  | Zakończenie checkoutu               |
| 11  | `checkout_contact_info_submitted`  | Standard  | Checkout – dane kontaktowe          |
| 12  | `checkout_address_info_submitted`  | Standard  | Checkout – adres                    |
| 13  | `checkout_shipping_info_submitted` | Standard  | Checkout – wysyłka                  |
| 14  | `payment_info_submitted`           | Standard  | Checkout – płatność                 |
| 15  | `purchase_completed`               | Standard  | Zakup zrealizowany                  |
| 16  | `alert_displayed`                  | Standard  | Alert wyświetlony                   |
| 17  | `ui_extension_errored`             | Standard  | Błąd rozszerzenia UI                |
| 18  | `form_submitted`                   | DOM       | Formularz wysłany                   |
| 19  | `input_focused`                    | DOM       | Fokus na polu                       |
| 20  | `input_blurred`                    | DOM       | Blur pola                           |
| 21  | `input_changed`                    | DOM       | Zmiana wartości pola                |
| 22  | `click_with_position`              | epir:     | Klik z pozycją (heatmap)            |
| 23  | `scroll_depth`                     | epir:     | Głębokość scrolla                   |
| 24  | `page_exit`                        | epir:     | Wyjście ze strony / czas na stronie |
| 25  | `mouse_sample`                     | epir:     | Próbka ruchu myszy (heatmap)        |

Agent Analityk **nie wymyśla** eventów spoza tej listy – wszystkie pochodzą z Web Pixels API (standard + DOM) lub z TAE (epir:).

**Kolumny events_raw:**

| Kolumna         | Typ       | Opis                                                               |
| --------------- | --------- | ------------------------------------------------------------------ |
| `event_type`    | STRING    | Typ eventu (Shopify standard)                                      |
| `session_id`    | STRING    | ID sesji przeglądarki                                              |
| `customer_id`   | STRING    | ID klienta (anonimizowany)                                         |
| `url`           | STRING    | page_url                                                           |
| `payload`       | STRING    | Pełny JSON eventu                                                  |
| `created_at`    | TIMESTAMP | Czas utworzenia                                                    |
| `storefront_id` | STRING    | (docelowo) ID storefrontu: kazka/zareczyny                         |
| `channel`       | STRING    | (docelowo) Kanał: online-store, hydrogen-kazka, hydrogen-zareczyny |

### 1.2 messages_raw (BigQuery)

Tabela `analytics_435783047.messages_raw` – eksport z D1 `messages` (ai-assistant-sessions-db).

**Źródło:** Chat Worker (Session DO) → D1 `messages` → BigQuery Batch.

**Kolumny messages_raw:**

| Kolumna         | Typ     | Opis                          |
| --------------- | ------- | ----------------------------- |
| `id`            | INTEGER | ID wiadomości                 |
| `session_id`    | STRING  | ID sesji czatu                |
| `role`          | STRING  | user, assistant, system, tool |
| `content`       | STRING  | Treść wiadomości              |
| `timestamp`     | INTEGER | Unix ms                       |
| `tool_calls`    | STRING  | JSON wywołań narzędzi         |
| `tool_call_id`  | STRING  | ID odpowiedzi tool            |
| `name`          | STRING  | Nazwa narzędzia               |
| `storefront_id` | STRING  | (docelowo) kazka/zareczyny    |
| `channel`       | STRING  | (docelowo) Kanał sesji        |

### 1.3 storefront_id i channel – wartości i interpretacja

**storefront_id** – alias storefrontu (źródło danych / świat oferty):

| Wartość        | Znaczenie                                             |
| -------------- | ----------------------------------------------------- |
| `kazka`        | Headless storefront Kazka Jewelry (osobny asortyment) |
| `zareczyny`    | Headless storefront pierścionków zaręczynowych        |
| `online-store` | Klasyczny sklep Online Store (motyw)                  |
| `unknown`      | Nieznany (fallback)                                   |

**channel** – kanał techniczny (skąd pochodzi interakcja):

| Wartość              | Znaczenie                                                 |
| -------------------- | --------------------------------------------------------- |
| `hydrogen-kazka`     | Interakcje z frontu Hydrogen kazka                        |
| `hydrogen-zareczyny` | Interakcje z frontu Hydrogen zareczyny                    |
| `online-store`       | Interakcje z motywu Online Store (TAE)                    |
| `internal-dashboard` | Panel admin – **tylko tu** dostępne `run_analytics_query` |
| `unknown`            | Nieznany (fallback)                                       |

**Interpretacja:** `storefront_id = "kazka"` + `channel = "hydrogen-kazka"` oznacza, że event/wiadomość pochodzi z headless storefrontu Kazka. Segmentacja po tych polach pozwala analizować kazka vs zareczyny vs online-store osobno.

---

## 2. Ograniczenia (MUST)

### 2.1 Pola stabilne (można na nich budować wnioski)

- `event_type` – zgodne ze standardem Shopify
- `session_id` – spójne w ramach sesji
- `timestamp` / `created_at` – chronologia
- `storefront_id` – po wdrożeniu w pipeline

### 2.2 Pola best-effort / heurystyczne

- **storefront_inferred_from_url** – fallback do czasu wdrożenia `storefront_id`:

  - URL zawiera `kazka` → storefront = kazka
  - URL zawiera `zareczyny` → storefront = zareczyny
  - W przeciwnym razie → online-store lub unknown

- **customer_id** – anonimizowany; nie używać do identyfikacji osób

### 2.3 Tymczasowe obejście

**Docelowo** eventy będą wzbogacone o `storefront_id` i `channel`. Obecnie używamy inferencji z URL jako tymczasowego obejścia. Heurystyka jest opisana w sekcji 2.2.

---

## 3. Kanoniczne zapytania (Q1–Q10)

### Q1: Konwersja z czatem vs bez czatu

**ID:** `Q1_CONVERSION_CHAT`

**Opis:** Porównanie sesji, które użyły czatu, z sesjami bez czatu – czy sesje z czatem częściej kończą się zakupem?

**SQL (BigQuery):**

```sql
WITH chat_sessions AS (
  SELECT DISTINCT session_id FROM `analytics_435783047.messages_raw` WHERE role = 'user'
),
purchase_sessions AS (
  SELECT DISTINCT session_id FROM `analytics_435783047.events_raw`
  WHERE event_type = 'purchase_completed'
)
SELECT
  'with_chat' AS segment,
  COUNT(DISTINCT c.session_id) AS sessions_with_chat,
  COUNT(DISTINCT p.session_id) AS sessions_with_purchase
FROM chat_sessions c
LEFT JOIN purchase_sessions p ON c.session_id = p.session_id
UNION ALL
SELECT
  'without_chat' AS segment,
  (SELECT COUNT(DISTINCT session_id) FROM `analytics_435783047.events_raw`) - (SELECT COUNT(*) FROM chat_sessions) AS sessions_without_chat,
  (SELECT COUNT(DISTINCT session_id) FROM purchase_sessions) - (SELECT COUNT(DISTINCT c.session_id) FROM chat_sessions c JOIN purchase_sessions p ON c.session_id = p.session_id) AS sessions_with_purchase;
```

**Interpretacja:** Wyższy wskaźnik konwersji w segmencie `with_chat` sugeruje pozytywny wpływ asystenta.

---

### Q2: Ścieżki eventów (funnel)

**ID:** `Q2_CONVERSION_PATHS`

**Opis:** Liczba eventów na każdym etapie lejka: page_view → product_view → add_to_cart → purchase.

**SQL (BigQuery):**

```sql
SELECT
  event_type,
  COUNT(*) AS event_count,
  COUNT(DISTINCT session_id) AS unique_sessions
FROM `analytics_435783047.events_raw`
WHERE event_type IN ('page_viewed', 'product_viewed', 'product_added_to_cart', 'cart_updated', 'purchase_completed')
  AND created_at >= TIMESTAMP_SUB(CURRENT_TIMESTAMP(), INTERVAL 30 DAY)
GROUP BY event_type
ORDER BY
  CASE event_type
    WHEN 'page_viewed' THEN 1
    WHEN 'product_viewed' THEN 2
    WHEN 'product_added_to_cart' THEN 3
    WHEN 'cart_updated' THEN 4
    WHEN 'purchase_completed' THEN 5
    ELSE 6
  END;
```

**Interpretacja:** Spadek między etapami pokazuje gdzie użytkownicy rezygnują.

---

### Q3: Najczęstsze pytania w czacie

**ID:** `Q3_TOP_CHAT_QUESTIONS`

**Opis:** Najpopularniejsze zapytania użytkowników (role=user) w czacie.

**SQL (BigQuery):**

```sql
SELECT
  content,
  COUNT(*) AS occurrence_count
FROM `analytics_435783047.messages_raw`
WHERE role = 'user'
  AND LENGTH(TRIM(content)) > 5
  AND timestamp >= UNIX_MILLIS(TIMESTAMP_SUB(CURRENT_TIMESTAMP(), INTERVAL 30 DAY))
GROUP BY content
ORDER BY occurrence_count DESC
LIMIT 20;
```

**Interpretacja:** Powtarzające się pytania wskazują na luki w UX lub treściach.

---

### Q4: Segmentacja po domenie (storefront)

**ID:** `Q4_STOREFRONT_SEGMENTATION`

**Opis:** Rozkład eventów po storefrontzie – inferencja z `url` (page_url) do czasu wdrożenia `storefront_id`.

**SQL (BigQuery):**

```sql
SELECT
  CASE
    WHEN url LIKE '%kazka%' THEN 'kazka'
    WHEN url LIKE '%zareczyny%' THEN 'zareczyny'
    ELSE 'online-store'
  END AS storefront_inferred,
  event_type,
  COUNT(*) AS event_count
FROM `analytics_435783047.events_raw`
WHERE created_at >= TIMESTAMP_SUB(CURRENT_TIMESTAMP(), INTERVAL 30 DAY)
GROUP BY storefront_inferred, event_type
ORDER BY storefront_inferred, event_count DESC;
```

**Interpretacja:** Porównanie zachowań między kazka a zareczyny.

---

### Q5: Top produkty (wyświetlenia)

**ID:** `Q5_TOP_PRODUCTS`

**Opis:** Najczęściej wyświetlane produkty.

**SQL (BigQuery):**

```sql
SELECT
  JSON_VALUE(payload, '$.data.productVariant.product.id') AS product_id,
  JSON_VALUE(payload, '$.data.productVariant.product.title') AS product_title,
  COUNT(*) AS view_count
FROM `analytics_435783047.events_raw`
WHERE event_type = 'product_viewed'
  AND created_at >= TIMESTAMP_SUB(CURRENT_TIMESTAMP(), INTERVAL 30 DAY)
GROUP BY product_id, product_title
ORDER BY view_count DESC
LIMIT 20;
```

**Uwaga:** Struktura `payload` zależy od formatu Shopify. Jeśli `product_id` jest w osobnym polu, dostosuj zapytanie.

---

### Q6: Sesje z czatem – liczba wiadomości

**ID:** `Q6_CHAT_ENGAGEMENT`

**Opis:** Średnia liczba wiadomości na sesję czatu.

**SQL (BigQuery):**

```sql
SELECT
  session_id,
  COUNT(*) AS message_count,
  COUNTIF(role = 'user') AS user_messages,
  COUNTIF(role = 'assistant') AS assistant_messages
FROM `analytics_435783047.messages_raw`
WHERE timestamp >= UNIX_MILLIS(TIMESTAMP_SUB(CURRENT_TIMESTAMP(), INTERVAL 30 DAY))
GROUP BY session_id
ORDER BY message_count DESC
LIMIT 50;
```

---

### Q7: Konwersja product_viewed → purchase (sesje)

**ID:** `Q7_PRODUCT_TO_PURCHASE`

**Opis:** Ile sesji z wyświetleniem produktu kończy się zakupem.

**SQL (BigQuery):**

```sql
WITH product_sessions AS (
  SELECT DISTINCT session_id FROM `analytics_435783047.events_raw`
  WHERE event_type = 'product_viewed'
),
purchase_sessions AS (
  SELECT DISTINCT session_id FROM `analytics_435783047.events_raw`
  WHERE event_type = 'purchase_completed'
)
SELECT
  COUNT(DISTINCT p.session_id) AS product_view_sessions,
  COUNT(DISTINCT pur.session_id) AS purchase_sessions,
  ROUND(100.0 * COUNT(DISTINCT pur.session_id) / NULLIF(COUNT(DISTINCT p.session_id), 0), 2) AS conversion_rate_pct
FROM product_sessions p
LEFT JOIN purchase_sessions pur ON p.session_id = pur.session_id;
```

---

### Q8: Eventy dziennie (trend)

**ID:** `Q8_DAILY_EVENTS`

**Opis:** Liczba eventów dziennie w ostatnich 30 dniach.

**SQL (BigQuery):**

```sql
SELECT
  DATE(created_at) AS event_date,
  event_type,
  COUNT(*) AS event_count
FROM `analytics_435783047.events_raw`
WHERE created_at >= TIMESTAMP_SUB(CURRENT_TIMESTAMP(), INTERVAL 30 DAY)
GROUP BY event_date, event_type
ORDER BY event_date DESC, event_count DESC;
```

---

### Q9: Narzędzia MCP w czacie

**ID:** `Q9_TOOL_USAGE`

**Opis:** Które narzędzia MCP są najczęściej wywoływane w czacie.

**SQL (BigQuery):**

```sql
SELECT
  name AS tool_name,
  COUNT(*) AS call_count
FROM `analytics_435783047.messages_raw`
WHERE role = 'tool'
  AND name IS NOT NULL
  AND timestamp >= UNIX_MILLIS(TIMESTAMP_SUB(CURRENT_TIMESTAMP(), INTERVAL 30 DAY))
GROUP BY name
ORDER BY call_count DESC;
```

---

### Q10: Czas między pierwszym a ostatnim eventem w sesji

**ID:** `Q10_SESSION_DURATION`

**Opis:** Średni czas trwania sesji (różnica między min a max timestamp w sesji).

**SQL (BigQuery):**

```sql
SELECT
  session_id,
  MIN(created_at) AS first_event,
  MAX(created_at) AS last_event,
  TIMESTAMP_DIFF(MAX(created_at), MIN(created_at), SECOND) AS duration_seconds
FROM `analytics_435783047.events_raw`
WHERE created_at >= TIMESTAMP_SUB(CURRENT_TIMESTAMP(), INTERVAL 30 DAY)
GROUP BY session_id
HAVING duration_seconds > 0
ORDER BY duration_seconds DESC
LIMIT 100;
```

---

## 4. run_analytics_query – dostęp i ograniczenia

**Dostępność:** Narzędzie jest dostępne **wyłącznie** gdy `channel === "internal-dashboard"` (panel admin). Nigdy w kontekście anonimowego kupującego.

**Zasady:**

- Agent Analityk **nie tworzy** nowych zapytań SQL samodzielnie – tylko wybiera spośród whitelisty.
- `queryId` musi być wcześniej zdefiniowany w ANALYTICS_KB i w kodzie Workera.
- Nowe zapytania dodaje się przez aktualizację whitelisty w kodzie, nie przez LLM.

### 4.1 Whitelista queryId

Dozwolone wartości `queryId`:

- `Q1_CONVERSION_CHAT`
- `Q2_CONVERSION_PATHS`
- `Q3_TOP_CHAT_QUESTIONS`
- `Q4_STOREFRONT_SEGMENTATION`
- `Q5_TOP_PRODUCTS`
- `Q6_CHAT_ENGAGEMENT`
- `Q7_PRODUCT_TO_PURCHASE`
- `Q8_DAILY_EVENTS`
- `Q9_TOOL_USAGE`
- `Q10_SESSION_DURATION`

---

## 5. TODO po wdrożeniu

### MUST

1. **Migracja messages (storefront_id, channel):**

   ```bash
   cd workers/chat
   wrangler d1 execute ai-assistant-sessions-db --remote --file=./migrations/003_storefront_messages.sql
   ```

   Bez tego wiadomości czatu nie będą miały storefront_id/channel w D1.

2. **Sekret ADMIN_KEY w bigquery-batch:**

   ```bash
   cd workers/bigquery-batch
   wrangler secret put ADMIN_KEY
   ```

   Bez tego POST /internal/analytics/query nie przyjmuje żadnych żądań.

3. **Schemat BigQuery:** Rozszerzyć tabele `events_raw` i `messages_raw` o kolumny `storefront_id` i `channel` (BigQuery Console / bq CLI), jeśli nie robi się to automatycznie.

### SHOULD

- **Panel internal:** Przy wywołaniach czata z panelu admin ustawiaj `channel: "internal-dashboard"` i przekazuj `storefront_id` zależnie od analizowanego świata (kazka/zareczyny/global). Dzięki temu `run_analytics_query` będzie dostępne tylko w tej ścieżce.

---

## 6. Odniesienia

- Ten dokument jest **pomocniczy**. Dokumenty nadrzędne dla całego repo to:

  - [EPIR_AI_ECOSYSTEM_MASTER.md](../EPIR_AI_ECOSYSTEM_MASTER.md)
  - [EPIR_AI_BIBLE.md](../EPIR_AI_BIBLE.md)

- [Shopify Web Pixels API](https://shopify.dev/docs/api/web-pixels-api)
- [Web pixel standard events](https://shopify.dev/docs/api/web-pixels-api/standard-events)
- [EPIR_AI_BIBLE.md](../EPIR_AI_BIBLE.md) – architektura i orthodoksja ESOG
