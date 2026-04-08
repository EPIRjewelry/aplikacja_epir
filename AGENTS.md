# AGENTS.md

## Cel

Ten plik jest wspólnym onboardingiem dla ludzi i narzędzi AI pracujących w `d:\aplikacja_epir`.

Repo i mirror NotebookLM mają utrzymywać **dokładnie ten sam zestaw dokumentów**. Nie ma tu miejsca na równoległe notatki, archiwa „na wszelki wypadek” ani alternatywne opisy architektury.

## Czytaj najpierw

Obowiązkowa kolejność:

1. `AGENTS.md`
2. `EPIR_AI_ECOSYSTEM_MASTER.md`
3. `EPIR_AI_BIBLE.md`
4. `docs/README.md`

## Niezmienne fakty

- **Jedna aplikacja Shopify:** `epir_ai`
- **Jedna gałąź kanoniczna:** `main`
- **Jedno repo źródłowe:** `EPIRjewelry/aplikacja_epir`
- **Jedna dokumentacja kanoniczna:** wyłącznie pliki wymienione w `docs/README.md`

Jeżeli propozycja zmian zakłada drugi backend, drugi zestaw dokumentów lub drugi „prawdziwszy” stan poza tym repo, traktuj to jako błąd założeń.

## Rola dokumentów bazowych

### `EPIR_AI_ECOSYSTEM_MASTER.md`

Opisuje:

- model systemu,
- podział storefrontów i kanałów,
- role agentów AI,
- przepływ runtime między Shopify, Cloudflare i analityką.

### `EPIR_AI_BIBLE.md`

Definiuje:

- zasady nienegocjowalne,
- orthodoksję ESOG,
- guardrails bezpieczeństwa i architektury,
- reguły pracy dla ludzi, agentów i recenzji.

W razie konfliktu interpretacyjnego najpierw czytaj `EPIR_AI_ECOSYSTEM_MASTER.md`, a następnie `EPIR_AI_BIBLE.md`.

## Zasady pracy

1. Zanim zmienisz kod lub dokumentację, ustal, czy problem dotyczy architektury, danych, ingressu, deployu, analityki czy promptów.
2. Zawsze gruntuj decyzje w dokumentach bazowych i aktualnym kodzie.
3. Nie utrzymuj starych helperów, quizów ani checkpointów, jeśli ich treść została już wchłonięta do pakietu kanonicznego.
4. NotebookLM nie ma własnej wersji dokumentacji — utrzymuje mirror 1:1 repozytorium.
5. Jeżeli jakaś lokalna wiedza nie została zapisana w repo, nie istnieje jako źródło prawdy.

## Typowe rozróżnienia, których nie wolno gubić

- Frontend (`Theme App Extension`, `Hydrogen`) to UI i klient API.
- Backend (`workers/chat`, `workers/rag-worker`, `workers/analytics`, `workers/bigquery-batch`) utrzymuje logikę AI, sekrety, stan i integracje.
- `storefrontId` i `channel` są pierwszoklasowym kontekstem routingu.
- Buyer-facing `Gemma` i internal `Dev-asystent` to dwa różne konteksty pracy AI.

## Jeśli nie wiesz, od czego zacząć

Przeczytaj cztery pliki z sekcji „Czytaj najpierw”, a dopiero potem przechodź do kodu i dokumentów technicznych w `docs/`.
