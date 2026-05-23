# Dokumentacja EPIR AI

Ten katalog jest częścią jedynego kanonicznego pakietu dokumentacji EPIR. Ten sam zestaw plików musi istnieć 1:1 również w mirrorze NotebookLM.

## Kolejność czytania

1. [`../AGENTS.md`](../AGENTS.md)
2. [`../EPIR_AI_ECOSYSTEM_MASTER.md`](../EPIR_AI_ECOSYSTEM_MASTER.md)
3. [`../EPIR_AI_BIBLE.md`](../EPIR_AI_BIBLE.md)
4. [`README.md`](README.md)

## Kanoniczny zestaw dokumentów

Źródło prawdy dla architektury, release i kontraktów — **wiążące** przy konflikcie z research, notatkami lub odpowiedziami modeli.

### Dokumenty bazowe

- [`../AGENTS.md`](../AGENTS.md) — onboarding dla ludzi i narzędzi AI
- [`../EPIR_AI_ECOSYSTEM_MASTER.md`](../EPIR_AI_ECOSYSTEM_MASTER.md) — model systemu i podział odpowiedzialności
- [`../EPIR_AI_BIBLE.md`](../EPIR_AI_BIBLE.md) — zasady nienegocjowalne i guardrails

### Dokumenty techniczne w `docs/`

- [`EPIR_INGRESS_AND_RUNTIME.md`](EPIR_INGRESS_AND_RUNTIME.md) — techniczny kontrakt ingressu, runtime i aktualnych przepływów czatu
- [`EPIR_KB_MCP_POLICY_CONTRACT.md`](EPIR_KB_MCP_POLICY_CONTRACT.md) — jedyna prawda o politykach/FAQ: Shopify Knowledge Base + Storefront MCP; brak RAG jako źródła treści wiążących
- [`EPIR_MEMORY_ARCHITECTURE.md`](EPIR_MEMORY_ARCHITECTURE.md) — semantyczna pamięć klienta (typed facts w D1 + Vectorize `memory_customer`), deterministyczny skrót, KB-clamp i pipeline async Etap 3
- [`EPIR_DATA_SCHEMA_CONTRACT.md`](EPIR_DATA_SCHEMA_CONTRACT.md) — kontrakt danych Shopify, D1, Vectorize i BigQuery
- [`EPIR_ANALYTICS_DATA_CONTRACT.md`](EPIR_ANALYTICS_DATA_CONTRACT.md) — **szczegółowy** kontrakt hurtowni pixel/czat (D1 → Pipelines → Iceberg → R2 SQL, `Q1`–`Q10`); strażnik **EDCG**
- [`EPIR_DATA_FLOW_MAP.md`](EPIR_DATA_FLOW_MAP.md) — mapa operacyjna przepływu; strażnik **EDOG** (runtime)
- [`merge-gates/EDOG_IMPLEMENTATION_STEPS.md`](merge-gates/EDOG_IMPLEMENTATION_STEPS.md) — bramka kroków wdrożenia EDOG (`EDOG: PASS` między krokami)
- [`EPIR_WORKSPACE_MAP.md`](EPIR_WORKSPACE_MAP.md) — wiele repo + Cursor workspace + MCP
- [`CURSOR_CLOUD_AGENT_SETUP.md`](CURSOR_CLOUD_AGENT_SETUP.md) — agent w chmurze (MCP, bez SDK)
- [`EPIR_GWORKSPACE_REPORT_BRIDGE.md`](EPIR_GWORKSPACE_REPORT_BRIDGE.md) — raport dzienny → Drive (webhook)
- [`EPIR_DEPLOYMENT_AND_OPERATIONS.md`](EPIR_DEPLOYMENT_AND_OPERATIONS.md) — sekrety, migracje, deploy, runbook operacyjny i **formalna bramka go/no-go** (jedyna kanoniczna checklista release: CI, sekrety, fail-closed ingress, kolejność deployu, smoke)
- [`EPIR_BLUEPRINTS_AND_EXCEPTIONS.md`](EPIR_BLUEPRINTS_AND_EXCEPTIONS.md) — Project B, automatyzacje, limity API i zasady agentowe
- `merge-gates/` — karty merge gate per zakres PR (go/no-go dla pojedynczych pakietów zmian, zgodne z kanoniczną bramką release)

### Materiały robocze (mirror 1:1 z repo; niewiążące do czasu weryfikacji i wchłonięcia)

Te pliki **muszą** być w tym samym drzewie co NotebookLM (mirror 1:1), ale **nie** równają się kanonowi: to syntezy, Q&A i kompas z research — przed decyzją produkcyjną obowiązuje weryfikacja w **aktualnych** dokumentach dostawców oraz w kodzie `aplikacja_epir`.

- [`Architektura AI Analityka w Ekosystemie Cloudflare i Google Ads.md`](Architektura%20AI%20Analityka%20w%20Ekosystemie%20Cloudflare%20i%20Google%20Ads.md) — synteza (np. NotebookLM / deep research): hipotezy, linki, ryzyka; nie zastępuje `EPIR_*` ani wdrożenia.
- [`EPIR_CLOUDFLARE_AGENT_SERVICE_PLAN.md`](EPIR_CLOUDFLARE_AGENT_SERVICE_PLAN.md) — plan warstwy „agent jako usługa” (Agents SDK obok monorepo, bramki ESOG, publiczne repo); nie zastępuje kanonu ani kontraktu danych w `EPIR_*`.
- [`EPIR_PROJECT_B_COPILOT_VISION.md`](EPIR_PROJECT_B_COPILOT_VISION.md) — wizja „copilota” Project B (dane pixel/GA4/Ads, pamięć, koszt tokenów, tło, Workspace, okno czatu); kompas do wchłonięcia w kanon po ESOG.
- **Publiczne repo Project B (kod):** [github.com/EPIRjewelry/epir_analityc](https://github.com/EPIRjewelry/epir_analityc) — Worker Cloudflare Agents (`epir_analityc`); lustro źródła w katalogu [`epir-marketing-agent-service/`](../epir-marketing-agent-service/) w monorepo.

## Research i NotebookLM (zasada)

1. **Research i eksport z NotebookLM** — **kompas**: kierunki, lista repozytoriów, ostrzeżenia; **nie** ostateczne brzmienie limitów API (np. R2 SQL) ani „drugi kanon”.
2. **Decyzje architektoniczne i produkcyjne** dopiero po **dowodzie** z dokumentów w sekcji **Kanoniczny zestaw** powyżej albo z kodu w repo.
3. Gdy treść z materiału roboczego zostanie **wchłonięta** do kanonu, **usuń lub okroj** plik roboczy (bez duplikacji prawdy).

## Zasada porządku

Poza plikami z sekcji **Kanoniczny zestaw dokumentów** oraz **Materiały robocze** nie utrzymujemy dodatkowych helperów, quizów, checkpointów ani „historycznych” dokumentów. Gdy treść zostaje wchłonięta do pakietu kanonicznego, stary plik roboczy znika. Nowe syntezy research umieszczaj w `docs/` i od razu dopisuj tutaj (sekcja Materiały robocze) albo włącz treść do kanonu po redakcji.

## Dla agentów i onboardingów

Pliki startowe dla narzędzi AI:

- [`../AGENTS.md`](../AGENTS.md)
- [`../.github/copilot-instructions.md`](../.github/copilot-instructions.md)

Jeżeli jakikolwiek inny plik lub odpowiedź AI jest sprzeczna z pakietem powyżej, pakiet kanoniczny wygrywa.
