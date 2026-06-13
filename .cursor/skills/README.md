# EPIR — indeks wiedzy agentowej (Cursor)

**Status:** definicje ról agentów i wiedza domenowa przeniesione do modułowego SSOT.

## Gdzie jest wiedza?

| Potrzeba | Źródło |
|----------|--------|
| Router SSOT, guardrails, wybór modułu | [`EPIR_AI_BIBLE.md`](../../EPIR_AI_BIBLE.md) |
| UI/UX, Hydrogen, Gemma, Liquid | [`docs/kb/UI_UX_AND_FRONTEND.md`](../../docs/kb/UI_UX_AND_FRONTEND.md) + [`REVIEW.md`](../../REVIEW.md) |
| Dane, analityka, EDCG/EDOG/EAA | [`docs/kb/DATA_AND_ANALYTICS.md`](../../docs/kb/DATA_AND_ANALYTICS.md) |
| Workers, deploy, ESOG/EFA/OQAG | [`docs/kb/WORKERS_AND_EDGE.md`](../../docs/kb/WORKERS_AND_EDGE.md) |
| Entry point Cursor | [`.cursor/index.mdc`](../index.mdc) |
| Growth Engineer (workflow Cursor vs Operator Studio) | [`.cursor/rules/epir-growth-workflow.mdc`](../rules/epir-growth-workflow.mdc) + [`docs/PROJECT_B_SOLO_DEV_AGENTS.md`](../../docs/PROJECT_B_SOLO_DEV_AGENTS.md) |

## Werdykty bramkowe

- Warehouse: **ESOG: PASS** + **EDCG: PASS** — `docs/merge-gates/WAREHOUSE_DATA_CONTRACT.md`
- EDOG wdrożenie: **EDOG: PASS** — `docs/merge-gates/EDOG_IMPLEMENTATION_STEPS.md`
- OpenRouter Project B: **OQAG: PASS**

## Nie są kanonem Cursor (cross-link)

| Lokalizacja | Przeznaczenie |
|-------------|---------------|
| `agents/` | Opcjonalne Python CLI — read-only dla Cursor |
| `.github/agents/` | GitHub Copilot |
| `epir-marketing-agent-service/` | Worker `epir_analityc` (publiczne repo) |
| `.kilo/` | Kilo Code — izolowane od Cursor (`.cursorignore`) |

## Aktualizacja wiedzy

1. Edytuj moduł w `docs/kb/` lub router w `EPIR_AI_BIBLE.md`.
2. Przy zmianie UI/marki — aktualizuj `REVIEW.md`.
3. Nie twórz równoległych `SKILL.md` w tym katalogu.
