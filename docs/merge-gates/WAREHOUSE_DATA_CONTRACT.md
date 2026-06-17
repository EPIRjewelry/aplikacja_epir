# Merge gate: Warehouse data contract

Bramka dla zmian dotyczących **hurtowni pixel/czat** (D1 → Pipelines → Iceberg → R2 SQL).

**Kontrakt:** [`../EPIR_ANALYTICS_DATA_CONTRACT.md`](../EPIR_ANALYTICS_DATA_CONTRACT.md)

**Strażnicy:**

| Agent | Skill / plik | Zakres |
|-------|----------------|--------|
| **EDCG** | [`docs/kb/DATA_AND_ANALYTICS.md`](../kb/DATA_AND_ANALYTICS.md) § EDCG | Kontrakt danych, kolumny, R2 SQL |
| **ESOG** | [`docs/kb/WORKERS_AND_EDGE.md`](../kb/WORKERS_AND_EDGE.md) § ESOG | Ortodoksia workerów, sekrety, storefrontId/channel |

## Zasada PASS

Każdy **krok** poniżej jest uznany za zakończony **dopiero gdy** w recenzji (PR, chat implementacyjny) pojawią się **obie** linie:

```text
ESOG: PASS
EDCG: PASS
```

Becz obu — **nie** przechodź do następnego kroku. Implementator (ludzki lub agent) uruchamia kolejny krok dopiero po obu PASS.

Przy `FAIL` — poprawka i ponowna recenzja **tego samego** kroku.

---

## Kroki implementacji (kolejność)

| Krok | Zakres | Artefakty | CI |
|------|--------|-----------|-----|
| **1** | Agent EDCG + rejestracja kanonu | `docs/kb/DATA_AND_ANALYTICS.md` § EDCG, `data-contract-guardian.agent.md`, `docs/README.md`, `AGENTS.md` | — |
| **2** | Dokument kontraktu (ten pakiet) | `EPIR_ANALYTICS_DATA_CONTRACT.md`, link w `EPIR_DATA_SCHEMA_CONTRACT.md` | — |
| **3** | Example pipeline SQL + README | `pixel-pipeline-production.example.sql`, `pipelines-schemas/README.md` | — |
| **4** | Walidator CI kontraktu danych | `scripts/ci/validate-data-contract.py`, workflow / deploy-policy | `validate-data-contract.py` |
| **5** | dbt legacy etykieta | `analytics/dbt/**`, `sources.yml` | — |
| **6** | Prompt operatora (retest) | `operator-system-prompt.ts` | `vitest` chat |
| **7** | Deploy + retest operatorski | `wrangler deploy` bigquery-batch, Q1 w panelu | smoke opcjonalny |
| **8** | EDOG produkcja (opcjonalnie) | `GET /internal/flow-health` → `edog_verdict: PASS` | Bearer `DATA_GUARDIAN_OPS_KEY` |

---

## Kiedy obowiązuje ta bramka

PR lub zmiana dotykająca m.in.:

- `workers/analytics/`, `workers/bigquery-batch/`
- `analytics-queries.ts`, `analytics-query-ids.ts`
- `workers/bigquery-batch/pipelines-schemas/**`
- `docs/EPIR_ANALYTICS_DATA_CONTRACT.md`
- `scripts/ci/validate-data-contract.py`

---

## Werdykt końcowy merge gate

Przed merge do `main`:

1. Wszystkie dotknięte kroki mają **`ESOG: PASS`** + **`EDCG: PASS`**.
2. `python scripts/ci/validate-wrangler-prod-policy.py` — OK.
3. `python scripts/ci/validate-data-contract.py` — OK.
4. `npx vitest run` w `workers/bigquery-batch` — OK.

---

## Dziennik implementacji (2026-05-19)

| Krok | ESOG | EDCG | Uwagi |
|------|------|------|--------|
| **1** | PASS | PASS | Skill EDCG, agent GitHub, `AGENTS.md`, `docs/README.md` |
| **2** | PASS | PASS | `EPIR_ANALYTICS_DATA_CONTRACT.md`, link w `EPIR_DATA_SCHEMA_CONTRACT.md` |
| **3** | PASS | PASS | `pixel-pipeline-production.example.sql`, `pipelines-schemas/README.md` |
| **4** | PASS | PASS | `validate-data-contract.py` (SQL w literałach), job w `.github/workflows/deploy.yml` |
| **5** | PASS | PASS | `analytics/dbt/**` — etykieta legacy w `sources.yml` |
| **6** | PASS | PASS | `operator-system-prompt.ts` — retest po deploy operatora |
| **7** | PASS | PASS | Deploy `epir-bigquery-batch` (wersja `f572fd5f-4601-4dc0-a1fc-d8cf599ea516`, 2026-05-19); retest `Q1_CONVERSION_CHAT` w Operator Studio — operator |

**ESOG: PASS** — brak naruszeń orthodoksii (jeden backend, workers bez sekretów w repo, RPC `bigquery.analytics_query` w polityce CI).

**EDCG: PASS** — kontrakt D-01–D-08 odzwierciedlony w docs, example SQL, whitelist SQL i walidatorze CI.
