# dbt — epir_warehouse

Transformacje na danych BigQuery dla EPIR (staging → później marts). Nie zastępuje `docs/README.md`; to narzędzie analityczne obok workerów.

## Krok C — weryfikacja przed pierwszym runem dbt

1. **D1** (`jewelry-analytics-db`): czy są wiersze w `pixel_events` (sklep generuje ruch).
2. **Sekrety** workera `epir-bigquery-batch`: `GOOGLE_PROJECT_ID`, email + klucz SA z uprawnieniem do **BigQuery Data Editor** (insert) na docelowym projekcie.
3. **Cron** batcha: czy job się wykonuje (logi Cloudflare).
4. **BigQuery**: po pierwszym udanym eksporcie powinna pojawić się tabela **`epir_pixel_events_raw`** (pierwszy insert tworzy schemat zgodny z payloadem batcha). Zapytanie kontrolne:

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
