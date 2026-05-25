# `agents/` — opcjonalne CLI Python (nie kanon Cursor)

**Definicje ról agentów (ESOG, EFA, indexer, granice, werdykty):** wyłącznie [`.cursor/skills/`](../.cursor/skills/README.md).

Ten katalog zawiera **implementację uruchomieniową** (skrypty, Azure Framework, VS Code launch) — nie drugi zestaw zasad architektury.

| Folder | CLI | Kanoniczny skill |
|--------|-----|------------------|
| `epir_esog_agent/` | `python agents/epir_esog_agent/agent.py` | `.cursor/skills/epir-esog-agent/` |
| `epir_fix_agent/` | `python agents/epir_fix_agent/agent.py` | `.cursor/skills/epir-fix-agent/` |
| `indexer_agent/` | `python agents/indexer_agent/run_agent.py` | `.cursor/skills/epir-indexer-agent/` |
| `data_guardian/` | `cd agents/data_guardian && npm run audit` | `.cursor/skills/epir-edog-agent/` + `.cursor/rules/epir-edog-guardian.mdc` |

## Start (terminal, lokalnie)

Z roota repo:

```powershell
python agents/epir_esog_agent/agent.py "Check: workers/chat/src/index.ts"
python agents/epir_fix_agent/agent.py "Opis poprawki z werdyktu ESOG"
python agents/indexer_agent/run_agent.py
cd agents/data_guardian && npm install && npm run audit
```

## Tryby (`EPIR_AGENT_MODE`)

- `local` — bez Azure (domyślne)
- `auto` / `framework` — Azure AI Project (wymaga `.env` i `az login`)

Szczegóły w README każdego podagenta.

## Edycja promptów

Jeśli zmieniasz zachowanie agenta, edytuj **`SKILL.md`** w `.cursor/skills/`, potem zsynchronizuj skrót w `*/prompt.md` (opcjonalnie). Nie rozwijaj dwóch pełnych kopii instrukcji.
