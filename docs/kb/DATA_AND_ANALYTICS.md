# Dane i Analityka EPIR

Moduł wiedzy dla pixel_events, hurtowni D1 → Pipelines → Iceberg → R2 SQL oraz strażników EDCG/EDOG/EAA.

## Zasady danych (guardrails)

**MUST:**

- Shopify = źródło prawdy commerce (produkty, ceny, zamówienia).
- Stan rozmów: Cloudflare (SessionDO, D1); rozdziel historię sesji od historii zamówień.
- `_epir_session_id` — spójność między pixel, Hydrogen (Cart Attributes) i hurtownią.

**MUST NOT:**

- Obiecywać buyer-facing dostępu do danych, których system nie dostarcza.
- Zgadywać polityk sklepu zamiast kanonicznego źródła.
- Sekrety GCP/tokeny w frontendzie lub commitach.

## EAA (EPIR Analytics Agent)

**Rola:** ścieżka zdarzeń — Web Pixel / Hydrogen → Analytics Worker → batch → R2 SQL.

**Robi:** kontrakty zdarzeń, joiny po `session_id`, audyt payloadów, wskazuje `workers/analytics/`, `workers/bigquery-batch/`, `extensions/`, schematy SQL.

**Nie robi:** nowego silnika analityki, dużych refaktorów czatu, oceny orthodoksii Shopify (→ ESOG).

## EDCG (Data Contract Guardian)

**Rola:** kontrakt danych hurtowni — **nie implementuje kodu**.

**Źródła (kolejność):**

1. [`docs/EPIR_ANALYTICS_DATA_CONTRACT.md`](../EPIR_ANALYTICS_DATA_CONTRACT.md)
2. [`docs/EPIR_DATA_SCHEMA_CONTRACT.md`](../EPIR_DATA_SCHEMA_CONTRACT.md)
3. `workers/bigquery-batch/src/analytics-queries.ts`
4. `specs/schemas/` (ingest JSON)
5. `workers/analytics/src/index.ts` — `ensurePixelTable`

**Werdykt bramki warehouse:**

```text
EDCG: PASS
```

lub `EDCG: FAIL` + lista MUST. Kolejny krok dopiero po **`ESOG: PASS`** **oraz** **`EDCG: PASS`**.

**MUST (skrót):**

- R2 SQL tylko kolumny z kontraktu Iceberg; bez `url`/`payload` jako kolumn read model.
- Bez `SELECT DISTINCT` / `COUNT(DISTINCT)` — `GROUP BY` + `approx_distinct()`.
- `Q1`–`Q10` zgodne z macierzą queryId.
- Zmiana mapowania pipeline → aktualizacja SQL w repo + kontraktu.

CI: `python scripts/ci/validate-data-contract.py`

## EDOG (Data Operations Guardian)

**Rola:** audyt **stanu produkcyjnego** przepływu (nie kontraktu w repo — to EDCG). **Nie implementuje kodu.**

**Źródła:**

1. [`docs/EPIR_DATA_FLOW_MAP.md`](../EPIR_DATA_FLOW_MAP.md)
2. [`docs/merge-gates/EDOG_IMPLEMENTATION_STEPS.md`](../merge-gates/EDOG_IMPLEMENTATION_STEPS.md)
3. `GET /internal/flow-health` (Bearer `DATA_GUARDIAN_OPS_KEY`)

**Checklist:**

| Warstwa | Sprawdzenie |
|---------|-------------|
| `d1` | `d1_pixel_events_24h`; brak rosnącego `pending_pixel_events` bez planu |
| `batch` | `batch_exports.updated_at` < ~26 h (DEGRADED) / < 48 h (FAIL) |
| `pipeline` | `pipeline_pixel_configured` / messages |
| `r2sql` | `warehouse_q1_ok` — Q1_CONVERSION_CHAT gdy batch OK |

**Werdykt:** `EDOG: PASS` | `EDOG: FAIL`. `DEGRADED` z API = FAIL dla bramki. Kolejny krok wdrożenia tylko po `EDOG: PASS`.

**Pętla remediacji (po FAIL):**

1. Wypisz `reasons[]` i warstwę (`d1`|`batch`|`pipeline`|`r2sql`).
2. Zleć naprawę: batch/Pipelines → deploy/operator; kod workerów → EFA (po ESOG+EDCG); schema/SQL → EDCG.
3. Wymagaj `remediation_report` od wykonawcy.
4. Test: `cd agents/data_guardian && npm run audit` lub MCP `flow_health_summary`.
5. `EDOG: PASS` + świeży test → `EDOG: END`. Max 5 iteracji.

**MCP `epir-data-ops`:** `flow_health_summary`, `d1_metadata`, `d1_sample_rows`, `warehouse_probe` (Q1), `flow_map_excerpt`.

Spór schema/SQL w PR → **EDCG**, nie EDOG.

## Bramki merge

| Zakres | Wymaganie |
|--------|-----------|
| Warehouse / infrastruktura analityki | `ESOG: PASS` + `EDCG: PASS` przed kolejnym krokiem — [`merge-gates/WAREHOUSE_DATA_CONTRACT.md`](../merge-gates/WAREHOUSE_DATA_CONTRACT.md) |
| Wdrożenie EDOG | `EDOG: PASS` między krokami — [`merge-gates/EDOG_IMPLEMENTATION_STEPS.md`](../merge-gates/EDOG_IMPLEMENTATION_STEPS.md) |

## Ścieżka danych (skrót)

```
Pixel / Hydrogen → workers/analytics → D1 (pixel_events)
  → workers/bigquery-batch (batch export) → Pipelines → Iceberg (R2)
  → run_analytics_query (whitelist Q1–Q10, RPC BIGQUERY_BATCH_RPC)
```

Odczyt analytics chroniony: `ANALYTICS_S2S_RPC` + `scopes`, nie publiczne GET.
