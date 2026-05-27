# Store Steward — Cursor SDK runner

## Env

Skopiuj [`.env.example`](.env.example) → `.env` (nie commituj) **lub** ustaw zmienne w profilu Windows.

| Zmienna | Opis |
|---------|------|
| `CURSOR_API_KEY` | Cursor Integrations |
| `ANALYST_HTTP_BEARER` | **Ten sam** secret co `wrangler secret put ANALYST_HTTP_BEARER` na `epir-analyst-worker` — **nie** `DATA_GUARDIAN_OPS_KEY` |
| `EPIR_ANALYST_ORIGIN` lub `EPIR_ANALYST_WORKER_ORIGIN` | URL analyst-worker |
| (opcjonalnie) `EPIR_BATCH_WORKER_ORIGIN` | Jeśli ustawione, URL analyst wyprowadza się z batch (`epir-bigquery-batch` → `epir-analyst-worker`) |

Nie używaj `EPIR_CHAT_SHARED_SECRET` ani bezpośredniego URL store-steward — analyst proxyuje RPC.

```powershell
# Smoke bez Cursor (tylko pobranie insights):
npm run steward:report:dry

# Pełny raport (Cursor cloud + zapis do steward_reports):
npm run steward:report
```

Jeśli nie pamiętasz `ANALYST_HTTP_BEARER`, ustaw nowy na workerze i wklej ten sam do `.env`:

```powershell
cd workers/analyst-worker
npx wrangler secret put ANALYST_HTTP_BEARER
```
