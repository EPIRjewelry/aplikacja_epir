# EPIR AI BIBLE — Router SSOT

## Rola tego dokumentu

Nadrzędny punkt wejścia wiedzy agentowej. Odpowiada na: **czego nie wolno łamać** oraz **który moduł KB przeczytać** przed implementacją.

Jeżeli propozycja jest sprzeczna z tym plikiem lub wskazanym modułem `docs/kb/`, propozycja jest błędna.

`EPIR_AI_ECOSYSTEM_MASTER.md` mówi **jak system działa**. Ten dokument mówi **jakich granic nie przekraczać** i **dokąd routować**.

## Niezmienne fakty

1. **Jedna aplikacja Shopify:** `epir_ai`
2. **Jedna gałąź kanoniczna:** `main`
3. **Jedno repo źródłowe:** `EPIRjewelry/aplikacja_epir`
4. **Jedna dokumentacja kanoniczna:** sekcja *Kanoniczny zestaw dokumentów* w `docs/README.md`
5. **Jeden mirror NotebookLM:** kopia 1:1 dokumentów z repo

## Guardrails (skrót nienegocjowalny)

| # | MUST | MUST NOT |
|---|------|----------|
| 1 Frontend vs backend | AI, sekrety, stan w workerach | Admin API / sekrety / logika AI w kliencie |
| 2 Ingress | App Proxy (OS); BFF→S2S (headless) | Bezpośredni `/chat` z przeglądarki; omijanie HMAC |
| 3 Sekrety | Tylko backend i secret storage | Commit / dokumentacja z wartościami sekretów |
| 4 Kontekst | `storefrontId` + `channel` w routingu | Traktowanie jako opcjonalne |
| 5 Project A vs B | A = buyer-facing pełne guardrails | Rozszerzanie wyjątków B na A |
| 6 Dane | Shopify = commerce truth; stan w CF | Obietnice danych bez pokrycia w systemie |
| 7 Dokumentacja | Jeden pakiet kanoniczny | Drugi zestaw docs / „historyczne” duplikaty |
| 8 Review | Zgodność z guardrails = bramka wdrożenia | „Działa lokalnie” łamiąc orthodoksję |

Szczegóły techniczne → moduły `docs/kb/` poniżej.

## Router modułów (czytaj przed implementacją)

| Jeśli pracujesz nad… | Przeczytaj |
|----------------------|------------|
| Hydrogen, Theme, widget, Gemma, Liquid, UI marki | [`docs/kb/UI_UX_AND_FRONTEND.md`](docs/kb/UI_UX_AND_FRONTEND.md) + [`REVIEW.md`](REVIEW.md) |
| D1, pixel, batch, Iceberg, R2 SQL, EDCG/EDOG, lejek | [`docs/kb/DATA_AND_ANALYTICS.md`](docs/kb/DATA_AND_ANALYTICS.md) |
| Workers, deploy, ingress, sekrety, EFA, ESOG review | [`docs/kb/WORKERS_AND_EDGE.md`](docs/kb/WORKERS_AND_EDGE.md) |
| Model systemu, role agentów, runtime | [`EPIR_AI_ECOSYSTEM_MASTER.md`](EPIR_AI_ECOSYSTEM_MASTER.md) |
| PR review UI (Kilo) | [`REVIEW.md`](REVIEW.md) |
| Kontrakt ingressu / deploy runbook | [`docs/EPIR_INGRESS_AND_RUNTIME.md`](docs/EPIR_INGRESS_AND_RUNTIME.md), [`docs/EPIR_DEPLOYMENT_AND_OPERATIONS.md`](docs/EPIR_DEPLOYMENT_AND_OPERATIONS.md) |
| Kontrakt danych hurtowni | [`docs/EPIR_ANALYTICS_DATA_CONTRACT.md`](docs/EPIR_ANALYTICS_DATA_CONTRACT.md) |

## Router ról agentowych

| Rola | Moduł KB | Werdykt |
|------|----------|---------|
| **ESOG** | WORKERS_AND_EDGE § ESOG | `ESOG: PASS` / `ESOG: FAIL` |
| **EDCG** | DATA § EDCG | `EDCG: PASS` / `EDCG: FAIL` |
| **EDOG** | DATA § EDOG | `EDOG: PASS` / `EDOG: FAIL` |
| **EAA** | DATA § EAA | — |
| **EFA** | WORKERS § EFA | po ESOG |
| **Deploy** | WORKERS § Deploy | — |
| **OQAG** | WORKERS § OQAG | `OQAG: PASS` / `OQAG: FAIL` |
| **Curator** | UI § Curator | `CURATOR: PASS` / `CURATOR: FAIL` |
| **Indexer** | WORKERS § Indexer | — |

## Kolejność czytania (onboarding)

1. [`AGENTS.md`](AGENTS.md)
2. [`EPIR_AI_ECOSYSTEM_MASTER.md`](EPIR_AI_ECOSYSTEM_MASTER.md)
3. **Ten plik** (`EPIR_AI_BIBLE.md`) — router
4. [`docs/README.md`](docs/README.md)
5. Moduł(y) KB wskazane w tabeli routera powyżej
6. [`REVIEW.md`](REVIEW.md) — gdy dotyczy UI/Liquid/PR marki

## Izolacja środowisk

- **Cursor:** entry point [`.cursor/index.mdc`](.cursor/index.mdc); **nie** czytaj `.kilo/` ani `kilo.jsonc`; ignore → [`.cursorignore`](.cursorignore).
- **Kilo Code:** `instructions` → `REVIEW.md`, `EPIR_AI_BIBLE.md` (reszta przez router KB); ignore → [`.kilocodeignore`](.kilocodeignore) (**nie** czytaj `.cursor/`).
- **`agents/`**, **`.github/agents/`** — read-only dla Cursor bez wyraźnej prośby użytkownika.
