# EPIR Agents Quick Start

This folder contains two local-first Python agents:

- `epir_esog_agent` (ESOG): orthodoxy reviewer, returns compliance verdicts
- `epir_fix_agent` (EFA): patch suggestion generator for ESOG findings

## Start here (terminal)

Run from repository root (`d:\aplikacja_epir`):

```powershell
python agents/epir_esog_agent/agent.py "Check: workers/chat/src/index.ts contains admin token"
python agents/epir_fix_agent/agent.py "Set default_start_closed = false"
```

Expected in default setup:

- output includes `"mode": "local"`
- commands finish without Azure setup

## Start here (VS Code / F5)

Use launch profiles:

- `Run ESOG Agent`
- `Run EFA (Fix Agent)`

These profiles force `EPIR_AGENT_MODE=local` for stable local runs.

## Optional: enable Framework mode later

1. Set real values in root `.env`:
   - `AZURE_AI_PROJECT_ENDPOINT`
   - `AZURE_AI_MODEL_DEPLOYMENT_NAME`
2. Install per-agent dependencies (`requirements.txt`)
3. Run `az login`
4. Set `EPIR_AGENT_MODE=framework`

Mode behavior:

- `local`: always local, no Azure required
- `auto`: try framework only with real config; otherwise local
- `framework`: strict mode, fails fast on missing/invalid framework config
