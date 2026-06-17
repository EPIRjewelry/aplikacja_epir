# Audyt przepływu danych EPIR — 2026-06-17

**Status:** materiał roboczy (EDOG). Kanon mapy: [`EPIR_DATA_FLOW_MAP.md`](EPIR_DATA_FLOW_MAP.md).

**Źródło werdyktu:** raport operatora 2026-06-16 + logika [`edog-flow-health.ts`](../workers/bigquery-batch/src/edog-flow-health.ts).  
**Uwaga:** pełny JSON flow-health wymaga `GET /internal/operator-studio/api/flow-health` z kluczem operatora — odśwież po remediacji.

---

## Werdykt

| Pole | Wartość |
|------|---------|
| **EDOG** | `FAIL` |
| **Powody** | `pending_pixel_events_critical:23173`; `batch_exports_stale_hours:319.0` |

### Tłumaczenie po polsku

1. **23 173 zdarzeń pixel** w D1 (`jewelry-analytics-db`) nie zostało wyeksportowanych do hurtowni Iceberg — watermark `batch_exports.last_pixel_export_at` jest zatrzymany.
2. **319 godzin (~13,3 dnia)** od ostatniej aktualizacji `batch_exports.updated_at` — nocny eksport (`epir-bigquery-batch`, cron `0 2 * * *` UTC) **nie odświeża stanu batch** od ok. 2026-06-03.

**Root cause (hipoteza do potwierdzenia w logach CF):** warstwa **batch/pipeline** — cron nie wykonuje pełnego eksportu albo kończy się przed aktualizacją watermarku (typowo: brak `PIPELINE_PIXEL_INGEST_URL`, błąd HTTP ingest, lub cron wyłączony na workerze).

---

## Tabela warstw

| Warstwa | Status | Dowód |
|---------|--------|-------|
| **Capture** (Web Pixel → analytics) | **Prawdopodobnie OK** | Przy całkowitym braku zdarzeń pending byłby 0; backlog 23k wskazuje na **ciągłe zbieranie** do D1 |
| **D1 operacyjne** | **FAIL** (backlog) | `pending_pixel_events: 23173` (> próg 10 000) |
| **Batch** (`epir-bigquery-batch`) | **FAIL** | `batch_exports_stale_hours: 319` (> 48 h) |
| **Pipeline** (Pipelines ingest) | **UNKNOWN / FAIL** | Wymaga `pipeline_pixel_configured` z flow-health; przy `false` cron **nie eksportuje** |
| **Warehouse** (R2 SQL / Q1) | **SKIP** | `shouldProbeWarehouseQ1()` wyłącza sondę gdy batch stale lub pending > 10k |
| **Konsumenci** (Operator Studio, Q8) | **FAIL** | Q8 pominięte w raporcie dziennych przy `EDOG != PASS` |

---

## Timeline watermarków (szacunek)

| Zdarzenie | Czas (UTC, szac.) |
|-----------|-------------------|
| Ostatnia udana aktualizacja `batch_exports` | ~2026-06-03 02:00 (319 h przed 2026-06-16) |
| Raport operatora z FAIL | 2026-06-16 09:00 cron |
| Audyt dokumentu | 2026-06-17 |

---

## Plan naprawy (kolejność)

1. `node scripts/debug/cf-missing-secrets.mjs` — audyt sekretów `epir-bigquery-batch` (`PIPELINE_*`, `R2_SQL_API_TOKEN`).
2. Cloudflare → `epir-bigquery-batch` → Logs — szukaj `[WAREHOUSE_BATCH]`, `pipeline_chunk_failed`, `export_skipped_no_pipeline_urls`.
3. `.\scripts\edog-audit-report.ps1` — pełny JSON + narracja PL.
4. `POST /internal/operator-studio/api/trigger-warehouse-export` — powtórzyć ~10× (limit 2500 wierszy/run) aż `pending_pixel_after` < 1000.
5. `GET flow-health` → oczekiwane: `EDOG: PASS`, `batch_exports_stale_hours` < 26.
6. Kolejny raport 09:00 UTC powinien zawierać Q8.

---

## Co **nie** jest zepsute (nie naprawiać na ślepo)

- Blender bridge / Operator Studio ingress (osobny tor).
- Marketing ingest GA4/Ads (namespace `marketing`, nie pixel D1).
- Kontrakt kolumn Iceberg (EDCG — osobna bramka).
- `workers/chat` deploy — potrzebny dopiero po zmianach UI/narzędzi EDOG w tej iteracji.

---

## Narzędzia operacyjne (po wdrożeniu planu)

| Narzędzie | Cel |
|-----------|-----|
| `.\scripts\edog-audit-report.ps1` | Raport PL + JSON |
| `.\scripts\edog-remediate-export.ps1` | Pętla trigger export |
| Operator Studio → zakładka **Przepływ** | flow-health + wymuś eksport |
| Czat rola **Analityk** → `get_flow_health` | Audyt przed `run_analytics_query` |

---

_Wygenerowano w ramach audytu EDOG; zaktualizuj po live flow-health z produkcji._
