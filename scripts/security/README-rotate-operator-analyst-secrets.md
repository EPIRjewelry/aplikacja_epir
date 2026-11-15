# Rotacja `EPIR_OPERATOR_PANEL_SECRET` i `ANALYST_HTTP_BEARER` (2026-11-15)

Kontekst: po incydencie (wyciek `~/.cursor/mcp.secrets.env` przez skompromitowany token Cloudflare MCP) unieważnij te dwa sekrety **jednym przebiegiem** — ta sama nowa wartość na wszystkich workerach, które muszą się zgadzać.

**Środowisko Cloud Agent nie ma tokena CF** — rotację wykonuje operator lokalnie skryptem PowerShell.

## Inwentaryzacja (repo `aplikacja_epir`)

### `EPIR_OPERATOR_PANEL_SECRET`

| Miejsce | Rola |
|--------|------|
| Worker **`epir-art-jewellery-worker`** (`workers/chat/`) | **Serwer** — `X-Admin-Key`, Bearer model-variant, Operator Studio (`workers/chat/src/operator/operator-auth.ts`, `index.ts`) |
| Worker **`epir-dynamic-landing-liquid`** (`workers/dynamic-landing-liquid/`) | **Serwer** — podgląd landingu (`landing-preview.ts`) |
| `mcp-servers/epir-data-ops` | **Nie używa** (tylko `EPIR_READONLY_ANALYTICS_KEY` + opcjonalnie analyst) |
| `apps/operator-studio` | **Klient** — klucz w UI |
| `scripts/smoke-flow-health.ps1`, `edog-audit-report.ps1`, `edog-remediate-export.ps1`, `preview-apex-landing.mjs`, `bench-models.ts`, `smoke-harmony-tool-call.ts` | **Klient** — env / argument |
| `~/.cursor/mcp.secrets.env` (Windows) | **Klient** — Cursor User env dla MCP (jeśli kiedyś używany legacy) |

**Ta sama wartość** na obu workerach powyżej.

Root `wrangler.toml` to ten sam worker co `workers/chat` (Connected Git) — `secret put` z `workers/chat/` wystarczy dla `epir-art-jewellery-worker`.

### `ANALYST_HTTP_BEARER`

| Miejsce | Rola |
|--------|------|
| Worker **`epir-analyst-worker`** (`workers/analyst-worker/`) | **Serwer** — Bearer na `/v1/warehouse/query`, `/v1/steward/*` |
| `mcp-servers/epir-data-ops/src/server.ts` | **Klient** |
| `agents/store-steward/` | **Klient** — `.env` |
| `agents/data_guardian/orchestrator.ts` | **Klient** — przekazuje do MCP env |
| `.cursor/mcp.json` / `mcp-epir.example.json` | **Klient** — `${env:ANALYST_HTTP_BEARER}` |

`epir-store-steward` **nie** trzyma tego sekretu (tylko RPC / proxy przez analyst-worker).

Repozytorium `EPIRjewelry/epir-sklep-bot` — **niesprawdzone** w tej sesji (brak klonu); jeśli bot woła analyst HTTP, potrzebuje tego samego Bearer.

## Uruchomienie (Windows, operator)

```powershell
cd d:\aplikacja_epir
$env:CLOUDFLARE_API_TOKEN = '<token z Workers Scripts + Secrets Edit>'
.\scripts\security\rotate-operator-analyst-secrets.ps1
```

Suchy przebieg (tylko `whoami` + `secret list`):

```powershell
.\scripts\security\rotate-operator-analyst-secrets.ps1 -WhatIf
```

Skrypt:

1. Generuje 2× 64-znakowy hex (`RandomNumberGenerator`, 32 bajty).
2. `wrangler secret put` na workerach z tabeli (stdin, bez echo).
3. Zapisuje oba klucze do `%USERPROFILE%\.cursor\mcp.secrets.env`.
4. Wypisuje wynik `wrangler secret list` (**same nazwy**, bez wartości).

## Po rotacji (ręcznie)

- Zrestartuj Cursor (MCP).
- Wklej nowy `EPIR_OPERATOR_PANEL_SECRET` w Operator Studio (przeglądarka).
- Jeśli używasz `agents/store-steward` CLI: skopiuj `ANALYST_HTTP_BEARER` z `mcp.secrets.env` do `agents/store-steward/.env`.
- Opcjonalnie lokalne dev: `workers/chat/.dev.vars` / root `.dev.vars` — **nie** aktualizuje skrypt (tylko MCP plik).

## Czego skrypt NIE robi

- Nie zmienia DNS, tras, R2, D1, KV, deployu kodu.
- Nie rotuje innych sekretów (`EPIR_CHAT_SHARED_SECRET`, `EPIR_READONLY_ANALYTICS_KEY`, itd.).