# EPIR Store Steward (Agent Kustosz)

## Rola

Store Steward to **proaktywny mózg sklepu** — obserwuje zachowanie klientów na podstawie analityki, buduje wnioski i (od Fazy 1) proponuje ulepszenia sklepu. **Gemma** (`workers/chat`) pozostaje odizolowana.

## Dostęp — RPC, nie duplikacja sekretów

| Warstwa | Mechanizm |
|---------|-----------|
| `epir-store-steward` | Cron + **StoreStewardS2SRpc** (brak sekretów HTTP) |
| `epir-analyst-worker` | HTTP `/v1/steward/*` + **`ANALYST_HTTP_BEARER`** (proxy RPC) |
| Cursor agent | `EPIR_ANALYST_ORIGIN` + `ANALYST_HTTP_BEARER` (ten sam Bearer co warehouse) |

**Nie** kopiuj `EPIR_CHAT_SHARED_SECRET` na store-steward — to sekret ingressu czatu/BFF, nie analityki wewnętrznej.

Ochrona zewnętrzna: tylko **`ANALYST_HTTP_BEARER`** na `epir-analyst-worker`; RPC store-steward nie jest publiczne.

## Architektura (Faza 0)

| Warstwa | Ścieżka |
|---------|---------|
| Kontrakt | `packages/steward-contract` |
| Runtime | `workers/store-steward` |
| Wejście zewnętrzne | `workers/analyst-worker` → RPC |
| Orkiestracja | `agents/store-steward` (Cursor SDK) |

Źródła: D1 `pixel_events`, R2 SQL Q2/Q4/Q5/Q7/Q8 przez RPC do `epir-bigquery-batch`.

**Atrybucja (HAM):** agregacja `resolved_*`, bramka paid-unknown i opcjonalna rekonsyliacja Ads — [`EPIR_HAM_ATTRIBUTION.md`](EPIR_HAM_ATTRIBUTION.md). Sekrety marketingu (opcjonalnie): `MARKETING_INGEST_ORIGIN`, `MARKETING_OPS_PREVIEW_KEY` na workerze store-steward (te same co preview w czacie wewnętrznym).

## API (przez analyst-worker)

Bearer: `Authorization: Bearer <ANALYST_HTTP_BEARER>`

| Metoda | Ścieżka |
|--------|---------|
| POST | `/v1/steward/aggregate` |
| GET | `/v1/steward/insights` |
| POST | `/v1/steward/reports` |

Stare ścieżki `/internal/steward/*` na store-steward zwracają `404` (deprecated).

## Cursor SDK

```bash
export CURSOR_API_KEY="..."
export EPIR_ANALYST_ORIGIN="https://epir-analyst-worker.<account>.workers.dev"
export ANALYST_HTTP_BEARER="..."
npm run steward:report
```

## Deploy

Kolejność: `bigquery-batch` → **`store-steward`** → **`analyst-worker`** (binding RPC) → pozostałe.

Zobacz [`deploy-workers.ps1`](../deploy-workers.ps1).

## Faza 1

`StewardSessionContext` w `packages/steward-contract` → route SessionDO (po walidacji Fazy 0).
