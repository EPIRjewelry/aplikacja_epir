# EPIR Store Steward (Agent Kustosz)

## Rola

Store Steward to **proaktywny mózg sklepu** — obserwuje zachowanie klientów na podstawie analityki, buduje wnioski i (od Fazy 1) proponuje ulepszenia sklepu. **Gemma** (`workers/chat`) pozostaje odizolowana.

## Dostęp — RPC, nie duplikacja sekretów

| Warstwa | Mechanizm |
|---------|-----------|
| `epir-store-steward` | Cron + **StoreStewardS2SRpc** (brak sekretów HTTP) |
| **Operator Studio** | `epir-art-jewellery-worker` → `/internal/operator-studio/api/steward/*` (`X-Admin-Key` = `EPIR_OPERATOR_PANEL_SECRET`) → **STORE_STEWARD_RPC** |
| `epir-analyst-worker` (opcjonalnie) | HTTP `/v1/steward/*` + **`ANALYST_HTTP_BEARER`** (Cursor / curl) |
| Cursor agent | `EPIR_ANALYST_ORIGIN` + `ANALYST_HTTP_BEARER` **lub** panel API na czacie |

**Nie** kopiuj `EPIR_CHAT_SHARED_SECRET` na store-steward — to sekret ingressu czatu/BFF, nie analityki wewnętrznej.

RPC store-steward nie jest publiczne; ingress operatora: worker czatu + klucz panelu.

## Architektura (Faza 0)

| Warstwa | Ścieżka |
|---------|---------|
| Kontrakt | `packages/steward-contract` |
| Runtime | `workers/store-steward` |
| Wejście zewnętrzne | `workers/analyst-worker` → RPC |
| Orkiestracja | `agents/store-steward` (Cursor SDK) |

Źródła: D1 `pixel_events`, R2 SQL Q2/Q4/Q5/Q7/Q8 przez RPC do `epir-bigquery-batch`.

**Atrybucja (HAM):** agregacja `resolved_*`, bramka paid-unknown i opcjonalna rekonsyliacja Ads — [`EPIR_HAM_ATTRIBUTION.md`](EPIR_HAM_ATTRIBUTION.md). Podgląd Ads: binding **`MARKETING_INGEST_RPC`** (store-steward, czat, batch).

## API operatora (preferowane — worker czatu)

Nagłówek `X-Admin-Key` = `EPIR_OPERATOR_PANEL_SECRET`.

| Metoda | Ścieżka |
|--------|---------|
| POST | `/internal/operator-studio/api/steward/aggregate` |
| GET | `/internal/operator-studio/api/steward/insights` |

## API Cursor (opcjonalnie — analyst-worker)

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
