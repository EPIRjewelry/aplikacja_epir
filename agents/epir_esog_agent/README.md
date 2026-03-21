# Epir ESOG Agent

## Purpose

ESOG (EPIR Shopify Orthodoxy Guardian) reviews code and architecture against EPIR orthodoxy and current system architecture from:

- `../../EPIR_AI_ECOSYSTEM_MASTER.md`
- `../../EPIR_AI_BIBLE.md`

`EPIR_AI_ECOSYSTEM_MASTER.md` explains how the system is built; `EPIR_AI_BIBLE.md` defines the non-negotiable rules ESOG must enforce.

## Runtime model (local-first)

Default mode is now `local`, so the agent works immediately without Azure setup.

- `EPIR_AGENT_MODE=local` -> always use local deterministic mode
- `EPIR_AGENT_MODE=auto` -> try Framework only when real Azure config is present; otherwise use local
- `EPIR_AGENT_MODE=framework` -> strict Framework mode (no silent fallback; exits with error if runtime/config is invalid)

## Framework mode prerequisites

1. Install dependencies from `requirements.txt`.
2. Keep pinned preview-compatible dependencies, especially `azure-ai-projects==2.0.0b2`.
3. Fill repo root `.env` with real values:
   - `AZURE_AI_PROJECT_ENDPOINT`
   - `AZURE_AI_MODEL_DEPLOYMENT_NAME`
4. Authenticate locally with Azure CLI (`az login`).

## Quickstart

```powershell
python -m venv .venv
.venv\Scripts\Activate.ps1
pip install -r requirements.txt
python agent.py "Check: workers/chat/src/index.ts contains admin token"
```

## Enable Framework mode later

```powershell
$env:EPIR_AGENT_MODE = "framework"
az login
python agent.py "Check: workers/chat/src/index.ts contains admin token"
```

## Notes

- Root config lives in repo `.env`, not inside the agent folder.
- `framework` mode fails fast by design; `auto` mode keeps safe local fallback.
- `mcp_client.py` is still a stub and needs real worker/MCP integration.
