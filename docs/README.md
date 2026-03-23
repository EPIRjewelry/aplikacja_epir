# Dokumentacja EPIR AI

## Start tutaj

Jeśli wchodzisz do repo po raz pierwszy, **zacznij od tych dwóch plików w tej kolejności**:

1. [`../EPIR_AI_ECOSYSTEM_MASTER.md`](../EPIR_AI_ECOSYSTEM_MASTER.md) — onboarding, aktualna architektura, role agentów, prompty produkcyjne
2. [`../EPIR_AI_BIBLE.md`](../EPIR_AI_BIBLE.md) — orthodoksja, zasady nienegocjowalne, guardrails dla zmian

Te dwa dokumenty są **podstawowym źródłem prawdy** dla całego repo.

## Jak czytać dokumentację

- Chcesz zrozumieć **jak system jest zbudowany** → zacznij od `EPIR_AI_ECOSYSTEM_MASTER.md`
- Chcesz zrozumieć **jakich zasad nie wolno łamać** → czytaj `EPIR_AI_BIBLE.md`
- Chcesz coś **uruchomić, wdrożyć albo zmigrować** → dopiero potem przejdź do dokumentów operacyjnych poniżej

## Dokumenty nadrzędne

- [`../EPIR_AI_ECOSYSTEM_MASTER.md`](../EPIR_AI_ECOSYSTEM_MASTER.md)
- [`../EPIR_AI_BIBLE.md`](../EPIR_AI_BIBLE.md)

## Współdzielony kontekst AI po klonie repo

Jeśli otwierasz repo na nowym komputerze i chcesz, żeby narzędzia AI widziały ten sam kontekst repozytoryjny:

- [`../AGENTS.md`](../AGENTS.md) — wspólny onboarding AI dla repo
- [`../.github/copilot-instructions.md`](../.github/copilot-instructions.md) — instrukcje workspace dla GitHub Copilot

Te pliki są commitowane do repo, więc nowy klon dostaje ten sam kontekst startowy bez polegania na lokalnej pamięci czy stashu.

## Dokumenty operacyjne

- [`../KROKI_URUCHOMIENIA.md`](../KROKI_URUCHOMIENIA.md) — szybka sekwencja uruchomienia i deployu
- [`DEPLOYMENT_EPIR.md`](DEPLOYMENT_EPIR.md) — wdrożenie
- [`SEKRETY_I_MIGRACJE.md`](SEKRETY_I_MIGRACJE.md) — sekrety i migracje
- [`PODSUMOWANIE_WDROZENIA.md`](PODSUMOWANIE_WDROZENIA.md) — podsumowanie wdrożenia

## Dokumenty domenowe / pomocnicze

- [`ANALYTICS_KB.md`](ANALYTICS_KB.md) — analityka, BigQuery, definicje zapytań
- [`AUDYT_ZRODEL_MIGRACJI.md`](AUDYT_ZRODEL_MIGRACJI.md)
- [`ANALIZA_RAPORTU_DUPLIKACJI.md`](ANALIZA_RAPORTU_DUPLIKACJI.md)
- [`CLEAN_CODE_BASELINE_PLAN.md`](CLEAN_CODE_BASELINE_PLAN.md)
- [`RAPORT_NAPRAWY_CZATU.md`](RAPORT_NAPRAWY_CZATU.md)

## Zasada porządku

Jeżeli jakikolwiek dokument pomocniczy jest sprzeczny z:

- `EPIR_AI_ECOSYSTEM_MASTER.md`
- `EPIR_AI_BIBLE.md`

wtedy **wygrywają dokumenty nadrzędne**, a dokument pomocniczy wymaga aktualizacji.
