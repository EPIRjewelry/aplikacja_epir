# EPIR Fix Agent (EFA)

## Purpose

The EPIR Fix Agent generates focused patches from ESOG findings.

## Runtime model (local-first)

Default mode is now `local`, so the agent works immediately without Azure setup.

- `EPIR_AGENT_MODE=local` -> always use local patch generation
- `EPIR_AGENT_MODE=auto` -> try Framework only when real Azure config is present; otherwise use local
- `EPIR_AGENT_MODE=framework` -> strict Framework mode (no silent fallback; exits with error if runtime/config is invalid)

## Framework mode prerequisites

1. Install dependencies from `requirements.txt`.
2. Keep pinned preview-compatible dependencies, especially `azure-ai-projects==2.0.0b2`.
3. Fill repo root `.env` with real values:
   - `AZURE_AI_PROJECT_ENDPOINT`
   - `AZURE_AI_MODEL_DEPLOYMENT_NAME`
4. Run `az login` locally.

## Quickstart

```powershell
python -m venv .venv
.venv\Scripts\Activate.ps1
pip install -r requirements.txt
python agent.py "Set default_start_closed to launcher"
```

## Enable Framework mode later

```powershell
$env:EPIR_AGENT_MODE = "framework"
az login
python agent.py "Set default_start_closed to launcher"
```

## Notes

- Root config lives in repo `.env`.
- `framework` mode fails fast by design; `auto` mode keeps safe local fallback.
- EFA does not auto-commit or push.
- Generated changes should still be reviewed before applying.
