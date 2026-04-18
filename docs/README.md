# Dokumentacja EPIR AI

Ten katalog jest częścią jedynego kanonicznego pakietu dokumentacji EPIR. Ten sam zestaw plików musi istnieć 1:1 również w mirrorze NotebookLM.

## Kolejność czytania

1. [`../AGENTS.md`](../AGENTS.md)
2. [`../EPIR_AI_ECOSYSTEM_MASTER.md`](../EPIR_AI_ECOSYSTEM_MASTER.md)
3. [`../EPIR_AI_BIBLE.md`](../EPIR_AI_BIBLE.md)
4. [`README.md`](README.md)

## Kanoniczny zestaw dokumentów

### Dokumenty bazowe

- [`../AGENTS.md`](../AGENTS.md) — onboarding dla ludzi i narzędzi AI
- [`../EPIR_AI_ECOSYSTEM_MASTER.md`](../EPIR_AI_ECOSYSTEM_MASTER.md) — model systemu i podział odpowiedzialności
- [`../EPIR_AI_BIBLE.md`](../EPIR_AI_BIBLE.md) — zasady nienegocjowalne i guardrails

### Dokumenty techniczne w `docs/`

- [`EPIR_INGRESS_AND_RUNTIME.md`](EPIR_INGRESS_AND_RUNTIME.md) — techniczny kontrakt ingressu, runtime i aktualnych przepływów czatu
- [`EPIR_KB_MCP_POLICY_CONTRACT.md`](EPIR_KB_MCP_POLICY_CONTRACT.md) — jedyna prawda o politykach/FAQ: Shopify Knowledge Base + Storefront MCP; brak RAG jako źródła treści wiążących
- [`EPIR_MEMORY_ARCHITECTURE.md`](EPIR_MEMORY_ARCHITECTURE.md) — semantyczna pamięć klienta (typed facts w D1 + Vectorize `memory_customer`), deterministyczny skrót, KB-clamp i pipeline async Etap 3
- [`EPIR_DATA_SCHEMA_CONTRACT.md`](EPIR_DATA_SCHEMA_CONTRACT.md) — kontrakt danych Shopify, D1, Vectorize i BigQuery
- [`EPIR_DEPLOYMENT_AND_OPERATIONS.md`](EPIR_DEPLOYMENT_AND_OPERATIONS.md) — sekrety, migracje, deploy i runbook operacyjny
- [`EPIR_BLUEPRINTS_AND_EXCEPTIONS.md`](EPIR_BLUEPRINTS_AND_EXCEPTIONS.md) — Project B, automatyzacje, limity API i zasady agentowe

## Zasada porządku

Poza plikami z tej listy nie utrzymujemy dodatkowych helperów, quizów, checkpointów ani „historycznych” dokumentów. Gdy treść zostaje wchłonięta do pakietu kanonicznego, stary plik znika.

## Dla agentów i onboardingów

Pliki startowe dla narzędzi AI:

- [`../AGENTS.md`](../AGENTS.md)
- [`../.github/copilot-instructions.md`](../.github/copilot-instructions.md)

Jeżeli jakikolwiek inny plik lub odpowiedź AI jest sprzeczna z pakietem powyżej, pakiet kanoniczny wygrywa.
