# Schematy streamów Pipelines (D1 → Iceberg)

Pliki JSON są **1:1** z rekordami wysyłanymi przez `workers/bigquery-batch/src/index.ts` (`exportPixelEvents`, `exportMessages`).

**Kanoniczna lokalizacja schematów JSON:** [`specs/schemas/`](../../specs/schemas/) (`pixel-events-stream.schema.json`, `messages-stream.schema.json`). W Cursorze: `@specs/schemas/<plik>`.

- `pixel-events-stream.schema.json` — pola: `event_type`, `session_id`, `customer_id`, `storefront_id`, `channel`, `url`, `payload`, `created_at`
- `messages-stream.schema.json` — pola: `id`, `session_id`, `role`, `content`, `timestamp` (ms epoch), `tool_calls`, `tool_call_id`, `name`, `storefront_id`, `channel`

Format `fields` / `required` zgodny z dokumentacją Cloudflare Pipelines (structured stream).

## Wrangler (zalecane)

Z katalogu `workers/bigquery-batch` (zaloguj `wrangler login`):

```bash
npx wrangler pipelines streams create epir_pixel_events_stream ^
  --schema-file ../../specs/schemas/pixel-events-stream.schema.json ^
  --http-enabled true ^
  --http-auth false

npx wrangler pipelines streams create epir_messages_stream ^
  --schema-file ../../specs/schemas/messages-stream.schema.json ^
  --http-enabled true ^
  --http-auth false
```

Na Unixie zamień `^` na `\`. Z outputu skopiuj **HTTP ingest URL** do sekretów `PIPELINE_PIXEL_INGEST_URL` i `PIPELINE_MESSAGES_INGEST_URL`. Worker batch wysyła bez Bearer — streamy z **wyłączonym** HTTP auth (kanoniczna postura EPIR).

## Uwagi

- REST API i ścieżki zasobów zmieniają się między wersjami produktu — **nie commituj** surowych tokenów ani pełnych URL z query; używaj `wrangler secret put`.
- **Nie wklejaj** działających URL ingestu do issue / PR / czatu publicznego; jeśli już wyciekły, rozważ rotację streamu / tokena Pipelines Send.
- Jeśli zdarzenia są odrzucane (drop), sprawdź metryki user-error w Pipelines oraz zgodność typów (np. `timestamp` vs ISO string dla `created_at`).
- Schemat streamu w CF może mieć **dodatkowe** pola opcjonalne (`required: false`) spoza batcha — worker `epir-bigquery-batch` ich nie wyśle; w Icebergu będą `NULL`, o ile typy się zgadzają.

---

## Krok 5 — Sinki (R2 Data Catalog → Iceberg)

**Warunki wstępne:** bucket R2 `epir-analytics-iceberg-warehouse` istnieje, **R2 Data Catalog** jest włączony na tym buckecie, masz **catalog token** (to samo przeznaczenie co sekret `R2_SQL_API_TOKEN` na workerach — token konta z odczytem/zapisem katalogu i R2 SQL według [dokumentacji](https://developers.cloudflare.com/r2-sql/get-started/)).

Z katalogu `workers/bigquery-batch` (token **nie** wklejaj do historii shell — użyj zmiennej środowiskowej lokalnie):

```bash
# Pixel → tabela zgodna z WAREHOUSE_SQL_* w wrangler.toml
npx wrangler pipelines sinks create epir_pixel_events_sink \
  --type r2-data-catalog \
  --bucket epir-analytics-iceberg-warehouse \
  --namespace analytics \
  --table epir_pixel_events_raw \
  --catalog-token "$CF_R2_CATALOG_TOKEN"

# Wiadomości czatu
npx wrangler pipelines sinks create epir_messages_sink \
  --type r2-data-catalog \
  --bucket epir-analytics-iceberg-warehouse \
  --namespace analytics \
  --table messages_raw \
  --catalog-token "$CF_R2_CATALOG_TOKEN"
```

Opcjonalnie dopasuj **roll** / kompresję do obciążenia (patrz `npx wrangler pipelines sinks create --help` oraz [R2 Data Catalog sink](https://developers.cloudflare.com/pipelines/sinks/available-sinks/r2-data-catalog/)) — np. `--roll-interval`, `--compression zstd`.

**Uwaga:** wg dokumentacji Cloudflare **sinku nie utworzysz na już istniejącej** tabeli Iceberg o tej samej nazwie — jeśli wcześniej powstały ślady tabel, trzeba użyć innej nazwy albo posprzątać stan w katalogu zgodnie z polityką operacyjną.

**Partycjonowanie i rolling (obserwacja operatorska):** w API sinków typu `r2_data_catalog` często **nie ma** osobnej, jawnej konfiguracji partycji po wzorcu czasu — układ partycji (np. Hive-style `date=YYYY-MM-DD/`) wynika z **R2 Data Catalog** i typów kolumn czasu (`created_at` jako `timestamp`, `timestamp` wiadomości jako `int64` ms itd.). **Rolling** (zamykanie plików Parquet) ustala się polityką sinka (np. interwał ~300 s i okno nieaktywności ~60 s — wartości przykładowe; dokładne flagi: `wrangler pipelines sinks create --help` / Dashboard). Format zapisu w sinku to **Parquet** pod Iceberg.

---

## Krok 6 — Pipeline’y (SQL: stream → sink)

Nazwy zasobów (`…_stream` / `…_sink`) muszą odpowiadać **tym**, które masz w Cloudflare. Poniżej **szablon** na szybki start (gdy kolumny streamu i Iceberg sinku są 1:1). W **produkcji** często używa się **jawnego** `INSERT INTO …_sink SELECT …` z aliasami i podzbiorem kolumn — wtedy źródłem prawdy dla SQL jest **Dashboard / `wrangler pipelines get`**, nie ten plik.

### Ograniczenie Cloudflare

**SQL pipeline’u nie edytuje się po utworzeniu** — zmiana transformacji wymaga usunięcia pipeline’u i utworzenia go na nowo (patrz [Manage pipelines](https://developers.cloudflare.com/pipelines/pipelines/manage-pipelines/)).

### Szablon (`SELECT *`) — tylko gdy stream ≡ sink

```bash
npx wrangler pipelines create epir_pixel_events_pipeline \
  --sql "INSERT INTO epir_pixel_events_sink SELECT * FROM epir_pixel_events_stream"

npx wrangler pipelines create epir_messages_pipeline \
  --sql "INSERT INTO epir_messages_sink SELECT * FROM epir_messages_stream"
```

### Produkcja — jawny SQL i zgodność z batchem

**Szablon kanoniczny (repo):** [`pixel-pipeline-production.example.sql`](pixel-pipeline-production.example.sql) — mapowanie stream → kolumny Iceberg zgodne z [`docs/EPIR_ANALYTICS_DATA_CONTRACT.md`](../../docs/EPIR_ANALYTICS_DATA_CONTRACT.md). Po zmianie w Dashboard zaktualizuj ten plik i przejdź recenzję **EDCG**.

Worker [`src/index.ts`](../src/index.ts) wysyła na ingest **pixel** JSON z polami:

`event_type`, `session_id`, `customer_id`, `storefront_id`, `channel`, **`url`** (z `page_url` w D1), `payload`, **`created_at`** (ISO z D1).

**Wiadomości:** `id`, `session_id`, `role`, `content`, `timestamp` (ms), `tool_calls`, `tool_call_id`, `name`, `storefront_id`, `channel`.

W SQL pipeline’u odwołujesz się do **nazw kolumn zdefiniowanych na streamie** (zgodnych ze schematem ingestu). Jeśli w SQL używasz np. `referrer` albo `timestamp` jako kolumny źródłowe zamiast `url` / `created_at`, upewnij się, że **faktyczny schemat streamu** te pola ma — inaczej batch nadal wyśle `url`/`created_at`, a mapowanie w pipeline nie zadziała (puste wartości, dropy, błędy). Typowy wzorzec produkcyjny: jawne `SELECT` z aliasami do kolumn sinku (Iceberg), ewentualnie `NULL AS …` dla kolumn w sinku, których batch nie zasil.

Przykładowe operatory mają m.in. **7 kolumn** dla wiadomości (bez `shop_domain` ze streamu) albo mapowania pixelowego z funkcjami czasu — to jest OK, o ile każda kolumna źródłowa w `SELECT` istnieje na streamie **albo** jest literałem/wyrażeniem poprawnym dla Pipelines SQL.

Dokumentacja transformacji: [SQL transformations](https://developers.cloudflare.com/pipelines/pipelines/manage-pipelines/).

**Inspekcja:** `npx wrangler pipelines list`, `npx wrangler pipelines get <PIPELINE_ID>` — **nie commituj** ID ani pełnego SQL z produkcji do repo, jeśli zawierają dane wrażliwe.

---

## Krok 7 — Sekrety workera `epir-bigquery-batch`

```bash
cd workers/bigquery-batch
wrangler secret put PIPELINE_PIXEL_INGEST_URL    # https://<stream-id>.ingest.cloudflare.com
wrangler secret put PIPELINE_MESSAGES_INGEST_URL
wrangler secret put R2_SQL_API_TOKEN             # ten sam sens co catalog token / R2 SQL
```

Na `epir-analityc-worker` ustaw ten sam sens **`R2_SQL_API_TOKEN`** oraz **`SHOPIFY_WEBHOOK_SECRET`**, jeśli jeszcze brakuje.
