# EPIR — indeks skilli Cursor (jedyne źródło definicji agentów)

**Status:** kanoniczne dla Cursor i agentów w tym repo.

| Skill | Rola | Kiedy używać |
|-------|------|----------------|
| [epir-esog-agent](epir-esog-agent/SKILL.md) | **ESOG** — orthodoksia Shopify/EPIR | Code review, zgodność z Bible/Master |
| [epir-edcg-agent](epir-edcg-agent/SKILL.md) | **EDCG** — kontrakt danych hurtowni | Zmiany analytics, batch, R2 SQL, schematy |
| [epir-edog-agent](epir-edog-agent/SKILL.md) | **EDOG** — operacyjny przepływ danych | flow-health, lag batch, audyt przed analityką |
| [epir-analytics-agent](epir-analytics-agent/SKILL.md) | **EAA** — ścieżka zdarzeń / pixel | Lejek, Pipelines, session_id, warehouse |
| [epir-fix-agent](epir-fix-agent/SKILL.md) | **EFA** — wdrożenie poprawek | Po werdykcie ESOG; refaktor, migracje |
| [epir-deployment](epir-deployment/SKILL.md) | Deploy Cloudflare + Shopify | `deploy.ps1`, wrangler, sekrety |
| [epir-oqag-agent](epir-oqag-agent/SKILL.md) | **OQAG** — bramka jakości OpenRouter | Integracja Project B / OpenRouter |
| [epir-indexer-agent](epir-indexer-agent/SKILL.md) | Indeks dokumentacji lokalny | `tools/index_docs.py`, embeddings |

## Nie są skillami Cursor (cross-link)

| Lokalizacja | Przeznaczenie |
|-------------|----------------|
| `agents/` | Opcjonalne **Python CLI** (ESOG/EFA lokalnie, Azure Framework). Prompty zsynchronizowane z skillami — **nie edytuj promptów tutaj bez aktualizacji SKILL.md**. |
| `.github/agents/` | **GitHub Copilot** (docs-reviewer, data-contract-guardian, etl, …) |
| `epir-marketing-agent-service/` | Osobny worker **`epir_analityc`** (publiczne repo); lustro w monorepo |

## Werdykty bramkowe

- Analityka / warehouse: **ESOG: PASS** + **EDCG: PASS** przed kolejnym krokiem (`docs/merge-gates/WAREHOUSE_DATA_CONTRACT.md`)
- Wdrożenie EDOG (krok po kroku): **EDOG: PASS** przed kolejnym krokiem (`docs/merge-gates/EDOG_IMPLEMENTATION_STEPS.md`)
- OpenRouter Project B: **OQAG: PASS** na krok planu

## Aktualizacja skilli

1. Edytuj `SKILL.md` w tym katalogu.
2. Jeśli dotyczy Python CLI — zsynchronizuj skrót w `agents/*/prompt.md` lub usuń duplikat (jedna treść).
3. Nie dodawaj równoległego „kanonu” w NotebookLM bez wpisu w `docs/README.md` (materiały robocze).
