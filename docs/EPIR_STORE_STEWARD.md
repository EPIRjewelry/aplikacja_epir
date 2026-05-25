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

### Scopes (`ctx.props` na service binding)

- `steward.ops` — agregacja
- `steward.read` — odczyt insights
- `steward.write` — zapis raportu

## Architektura (Faza 0)

| Warstwa | Ścieżka |
|---------|---------|
| Kontrakt | `packages/steward-contract` |
| Runtime | `workers/store-steward` |
| Wejście zewnętrzne | `workers/analyst-worker` → RPC |
| Orkiestracja | `agents/store-steward` (Cursor SDK) |

Źródła: D1 `pixel_events`, R2 SQL Q2/Q4/Q5/Q7/Q8 przez RPC do `epir-bigquery-batch`.

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
