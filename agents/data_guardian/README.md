# EDOG Data Guardian — orchestrator v2

Programistyczny orkiestrator audytu przepływu danych EPIR: **auto-naprawa** (`trigger-export`), **rdzeń deterministyczny** (flow-health + MCP stdio + `tsc` — zawsze w lokalnym `npm run audit`), opcjonalna warstwa LLM (Cursor cloud/local lub OpenRouter).

## Przełącznik LLM

| `EDOG_LLM_PROVIDER` | `EDOG_CURSOR_TARGET` | Wymaga |
|---------------------|----------------------|--------|
| `cursor` (domyślnie) | `cloud` (domyślnie) | `CURSOR_API_KEY` — subagent **dataFlowAuditor** w chmurze |
| `cursor` | `local` | `CURSOR_API_KEY` — subagent lokalnie + MCP |
| `openrouter` | — | `OPENROUTER_API_KEY`, `EDOG_OPENROUTER_MODEL` |
| `off` | — | tylko rdzeń (bez LLM) |

**Gotcha Cloud Runtime:** `EDOG_CURSOR_TARGET=cloud` uruchamia agenta w podstawowym VM — **nie** uruchamia `tsc` ani stdio MCP w subagencie (`UnsupportedRunOperationError`). Orkiestrator v2 uruchamia **`tsc` i MCP zawsze lokalnie** w procesie `npm run audit`; chmura służy wyłącznie opcjonalnemu audytowi jakościowemu (async API).

CLI nadpisuje env:

```powershell
npm run audit -- --provider=off
npm run audit -- --provider=openrouter --cursor-target=local
```

## Wymagane zmienne (wszystkie tryby)

| Zmienna | Opis |
|---------|------|
| `EPIR_BATCH_WORKER_ORIGIN` | URL workera batch |
| `DATA_GUARDIAN_OPS_KEY` | Bearer — ten sam secret co na workerze (`flow-health` + `trigger-export`) |
| `CLOUDFLARE_ACCOUNT_ID` | D1 read (MCP) |
| `CLOUDFLARE_API_TOKEN` | Token D1 Read |

Dodatkowo przy `EDOG_LLM_PROVIDER=cursor`: `CURSOR_API_KEY`. Przy `openrouter`: `OPENROUTER_API_KEY`, `EDOG_OPENROUTER_MODEL`.

## Instalacja i uruchomienie

1. Skopiuj [`.env.example`](.env.example) → `.env`.
2. Z katalogu `agents/data_guardian`:

```powershell
npm install --no-audit --no-fund
npm run audit
```

Wynik: [`audit_report.json`](audit_report.json) — pola m.in. `remediation`, `deterministic`, `llm_provider`, `gate_signature`.

Exit code: `0` = PASS, `1` = FAIL.

## Auto-naprawa

Gdy `pending_pixel_events >= 1000` i pipeline skonfigurowany, orkiestrator wywołuje `POST /internal/trigger-export` (max 30 runów, ~2500 wierszy/run) **przed** bramką. Raport: `remediation.runs[]`, `remediation.stopped_reason`.

## Bramka

`gate_signature: EDOG: PASS` tylko gdy `flow_health.edog_verdict === PASS` **oraz** `deterministic.tsc_ok` (i MCP połączony). `DEGRADED` → FAIL.

## Przykłady trybów

```powershell
# Domyślnie: auto-naprawa + tsc/MCP lokalnie + Cursor cloud (data flow)
npm run audit

# Bez LLM (najszybszy smoke remediacji)
$env:EDOG_LLM_PROVIDER='off'
npm run audit

# OpenRouter lokalnie
$env:EDOG_LLM_PROVIDER='openrouter'
$env:EDOG_OPENROUTER_MODEL='anthropic/claude-3.5-sonnet'
npm run audit
```

## Reguły i skill

- [`.cursor/rules/epir-edog-guardian.mdc`](../../.cursor/rules/epir-edog-guardian.mdc)
- [`.cursor/skills/epir-edog-agent/SKILL.md`](../../.cursor/skills/epir-edog-agent/SKILL.md)

## DAG v2

```text
flow-health (before)
    → auto trigger-export (HTTP)
    → flow-health (after)
    → MCP stdio + tsc (lokalnie, deterministyczne)
    → [opcjonalnie] LLM: Cursor dataFlowAuditor | OpenRouter | off
    → audit_report.json + gate_signature
```
