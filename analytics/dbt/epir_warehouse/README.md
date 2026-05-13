# dbt — epir_warehouse

Transformacje na danych BigQuery dla EPIR (staging → później marts). Nie zastępuje `docs/README.md`; to narzędzie analityczne obok workerów.

## Krok C — weryfikacja przed pierwszym runem dbt

1. **D1** (`jewelry-analytics-db`): czy są wiersze w `pixel_events` (sklep generuje ruch).
2. **Eksport** z D1 do hurtowni odbywa się workerm `epir-bigquery-batch` przez **Pipelines** (nie przez BigQuery). Patrz `docs/EPIR_DEPLOYMENT_AND_OPERATIONS.md`.
3. **Cron** batcha: czy job się wykonuje (logi Cloudflare).
4. **dbt na BigQuery** (osobna ścieżka): jeśli ładujesz dane z GCP, po eksporcie do BQ (np. z innego narzędzia) powinna istnieć tabela **`epir_pixel_events_raw`**. Zapytanie kontrolne:

```sql
SELECT COUNT(*) AS n
FROM `TWOJ_PROJECT_ID.analytics_435783047.epir_pixel_events_raw`
WHERE TIMESTAMP(created_at) >= TIMESTAMP_SUB(CURRENT_TIMESTAMP(), INTERVAL 7 DAY);
```

(Zamień `TWOJ_PROJECT_ID` na realny project id.)

## Krok A — nazwa tabeli

Eksport z `aplikacja_epir` trafia do **`epir_pixel_events_raw`**, żeby nie kolidować z inną tabelą **`events_raw`** w tym samym datasetcie (np. legacy ADK / ręczne tabele).

## dbt — uruchomienie

```bash
cd analytics/dbt/epir_warehouse
cp profiles.yml.example ~/.dbt/profiles_epir.yml.example   # tylko referencja; skonfiguruj ~/.dbt/profiles.yml
dbt deps   # opcjonalnie, gdy dodamy packages
dbt debug
dbt run --select stg_epir_pixel_events
```

Wymaga: Python, `pip install dbt-bigquery`, zalogowanie `gcloud auth application-default login` (lub SA w profilu).

## Recenzja (proces agentów)

1. **Wykonawca (EFA):** zmiany w workerze + whitelist + dbt szkielet.
2. **Recenzent (ESOG):** zgodność z kontraktem danych / brak sekretów w repo.
3. **PR:** opis + weryfikacja C po deploy.
4. **Merge:** po zielonym CI i akceptacji (człowiek lub polityka repo).
