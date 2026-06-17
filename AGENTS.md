# AGENTS.md

## Cel

Ten plik jest wspólnym onboardingiem dla ludzi i narzędzi AI pracujących w `d:\aplikacja_epir`.

Repo i mirror NotebookLM mają utrzymywać **dokładnie ten sam zestaw dokumentów** (kanon + materiały robocze wymienione w `docs/README.md`). Nie ma miejsca na **drugi kanoniczny** zestaw docs ani alternatywne opisy architektury poza tą listą. Syntezy research są dopuszczone **wyłącznie** jako **Materiały robocze** w `docs/README.md` — reguły i status w README.

## Czytaj najpierw

Obowiązkowa kolejność:

1. `AGENTS.md`
2. `EPIR_AI_ECOSYSTEM_MASTER.md`
3. `EPIR_AI_BIBLE.md` (router SSOT → moduły `docs/kb/`)
4. `docs/README.md`
5. `REVIEW.md` — gdy praca dotyczy UI/Liquid/PR marki (Kilo + Cursor)

## Niezmienne fakty

- **Jedna aplikacja Shopify:** `epir_ai`
- **Jedna gałąź kanoniczna:** `main`
- **Jedno repo źródłowe:** `EPIRjewelry/aplikacja_epir`
- **Jedna dokumentacja wiążąca (kanon):** wyłącznie sekcja **Kanoniczny zestaw dokumentów** w `docs/README.md`.
- **Materiały robocze** (ta sama sekcja w README): syntezy research / NotebookLM — **mirror 1:1**, lecz **niewiążące** do czasu weryfikacji i ewentualnego wchłonięcia do kanonu (szczegóły w README).

Jeżeli propozycja zmian zakłada drugi backend, drugi zestaw dokumentów lub drugi „prawdziwszy” stan poza tym repo, traktuj to jako błąd założeń.

## Rola dokumentów bazowych

### `EPIR_AI_ECOSYSTEM_MASTER.md`

Opisuje:

- model systemu,
- podział storefrontów i kanałów,
- role agentów AI,
- przepływ runtime między Shopify, Cloudflare i analityką.

### `EPIR_AI_BIBLE.md`

Router SSOT — definiuje:

- zasady nienegocjowalne (skrót),
- routing do modułów `docs/kb/` i ról agentowych (ESOG, EDCG, EDOG, EFA, …),
- guardrails bezpieczeństwa i architektury.

Moduły wiedzy domenowej: `docs/kb/UI_UX_AND_FRONTEND.md`, `docs/kb/DATA_AND_ANALYTICS.md`, `docs/kb/WORKERS_AND_EDGE.md`.

W razie konfliktu interpretacyjnego najpierw czytaj `EPIR_AI_ECOSYSTEM_MASTER.md`, a następnie `EPIR_AI_BIBLE.md`.

## Cursor — router SSOT i reguły

- **Entry point:** [`.cursor/index.mdc`](.cursor/index.mdc) (`alwaysApply`) → `EPIR_AI_BIBLE.md` + `REVIEW.md`.
- **Moduły wiedzy agentowej:** [`docs/kb/`](docs/kb/) — indeks: [`.cursor/skills/README.md`](.cursor/skills/README.md).
- **Reguły sesji Cursor:** [`.cursor/rules/`](.cursor/rules/) — thin pointers do Biblii (globy wg pliku).
- Folder **`agents/`** — opcjonalne **Python CLI** (read-only dla Cursor).
- **`.github/agents/`** — definicje pod **GitHub Copilot**.
- **`.kilo/`** — Kilo Code (izolowane od Cursor przez [`.cursorignore`](.cursorignore)).
- **Ignore kontekstu:** [`.cursorignore`](.cursorignore) — token budget + blokada `.kilo/`; zmiany sekcji token-budget synchronizuj z [`.kilocodeignore`](.kilocodeignore).

## Kilo Code — review UI / PR

- **Entry:** [`REVIEW.md`](REVIEW.md) + [`EPIR_AI_BIBLE.md`](EPIR_AI_BIBLE.md) (reszta przez router `docs/kb/`).
- **Ignore kontekstu:** [`.kilocodeignore`](.kilocodeignore) — lustro token-budget z `.cursorignore` + blokada `.cursor/` (Dual Plane).
- **Utrzymanie:** zmiana ignore w jednym pliku → zsynchronizuj drugi (sekcje token-budget i EPIR-specific w obu plikach).
- **Nie** duplikuj reguł `.mdc` — Kilo nie używa execution plane Cursora.

## Zasady pracy

1. Zanim zmienisz kod lub dokumentację, ustal, czy problem dotyczy architektury, danych, ingressu, deployu, analityki czy promptów.
2. Zawsze gruntuj decyzje w dokumentach bazowych i aktualnym kodzie.
3. Nie utrzymuj starych helperów, quizów ani checkpointów, jeśli ich treść została już wchłonięta do pakietu kanonicznego.
4. NotebookLM nie ma własnej wersji dokumentacji — utrzymuje mirror 1:1 repozytorium.
5. Jeżeli jakaś lokalna wiedza nie została zapisana w repo, nie istnieje jako źródło prawdy.
6. **Research i NotebookLM** nie zastępują kanonu: kompas i hipotezy — decyzje po weryfikacji z README (kanon) i kodem (`docs/README.md`, sekcje *Kanoniczny zestaw* i *Research i NotebookLM*).

## Sekrety (governance)

**Zakaz nowych nazw sekretów bez wyraźnej zgody operatora** — reguła Cursor: [`.cursor/rules/epir-secrets-governance.mdc`](.cursor/rules/epir-secrets-governance.mdc). Nie proponuj `wrangler secret put` ani nowych kluczy w UI/MCP bez zgody. Wewnętrznie: RPC między workerami; operator: `EPIR_OPERATOR_PANEL_SECRET`; sklep→czat: `EPIR_CHAT_SHARED_SECRET` (lub legacy `X-EPIR-SHARED-SECRET` w vault). Audyt nazw: `node scripts/debug/cf-missing-secrets.mjs`.

## Środowisko deweloperskie (Node, monorepo)

- **Instalacja zależności z katalogu głównego repo** (root), nie z pojedynczego `workers/*` ani `apps/*` jako substytut całego drzewa workspaces.
- **Standardowa komenda odświeżenia** (minimalna, idempotentna, zgodna z jobami GitHub Actions w tym repo):

  ```bash
  npm install --legacy-peer-deps --no-audit --no-fund
  ```

  (Skrót w root `package.json`: `npm run deps` — to samo.)

  Wyjaśnienie: `--legacy-peer-deps` omija twarde konflikty peer między workspace’ami; `--no-audit` i `--no-fund` skracają log (CI też tak robi).
- **Deploy lokalny** (`deploy.ps1`) używa `npm ci` z lockfile — to osobna, reprodukowalna ścieżka; przy pierwszym klonie albo po zmianach locka wykonaj `npm ci` z roota zgodnie ze skryptem.

## Typowe rozróżnienia, których nie wolno gubić

- Frontend (`Theme App Extension`, `Hydrogen`) to UI i klient API.
- Backend (`workers/chat`, `workers/rag-worker`, `workers/analytics`, `workers/bigquery-batch`, `workers/analyst-worker`, `workers/marketing-ingest`) utrzymuje logikę AI, sekrety, stan i integracje.
- `storefrontId` i `channel` są pierwszoklasowym kontekstem routingu.
- Buyer-facing `Gemma` i internal `Dev-asystent` to dwa różne konteksty pracy AI.

## Strażnicy i kontrakt danych (warehouse)

- **ESOG** — ortodoksia Shopify/app: `docs/kb/WORKERS_AND_EDGE.md` § ESOG
- **EDCG** — kontrakt danych analitycznych: `docs/kb/DATA_AND_ANALYTICS.md` § EDCG
- **EDOG** — operacyjny przepływ danych: `docs/kb/DATA_AND_ANALYTICS.md` § EDOG
- **Kanon szczegółowy:** `docs/EPIR_ANALYTICS_DATA_CONTRACT.md`
- **Bramka kroków** (każdy krok wymaga `ESOG: PASS` **oraz** `EDCG: PASS` przed kolejnym): `docs/merge-gates/WAREHOUSE_DATA_CONTRACT.md`
- **Bramka wdrożenia EDOG** (`EDOG: PASS` przed kolejnym krokiem): `docs/merge-gates/EDOG_IMPLEMENTATION_STEPS.md`
- **CI kontraktu:** `python scripts/ci/validate-data-contract.py`

## Jeśli nie wiesz, od czego zacząć

Przeczytaj cztery pliki z sekcji „Czytaj najpierw”, a dopiero potem przechodź do kodu i dokumentów technicznych w `docs/`.

## Cursor Cloud specific instructions

### Bezpieczeństwo Agent (lokalnie, poza repo)

Te ustawienia **nie** są w repozytorium — operator konfiguruje je w Cursorze:

- **Settings → Agent:** wyłącz Auto-Run / YOLO; wymagaj zatwierdzenia komend terminala (human-in-the-loop).
- **User settings (opcjonalnie):** `"json.schemaDownload.enable": false` globalnie dla nieufnych projektów; w tym repo workspace ma `true` w [`.vscode/settings.json`](.vscode/settings.json).

### Package manager

The project uses **npm workspaces** (root `package-lock.json`). Despite the `packageManager` field mentioning pnpm, all CI workflows, deploy scripts, and lockfiles use npm. Always use `npm install --legacy-peer-deps` to install dependencies.

### Running tests

Each worker and extension has its own Vitest config. Run tests per-workspace:

| Workspace | Command |
|---|---|
| `workers/chat` | `npx vitest run` |
| `workers/rag-worker` | `npx vitest run` |
| `workers/analytics` | `npx vitest run` |
| `workers/bigquery-batch` | `npx vitest run` |
| `workers/analyst-worker` | `npx vitest run` |
| `extensions/my-web-pixel` | `npx vitest run` |

### Running lint

- `apps/zareczyny`: `npm run lint` (uses `.eslintrc.cjs`, works)
- `apps/kazka`: has a pre-existing issue — `.eslintrc.js` should be `.eslintrc.cjs` due to `"type": "module"` in `package.json`. Lint currently fails with a CJS/ESM mismatch error.

### Running dev servers locally

- **Chat worker**: `cd workers/chat && npx wrangler dev --port 8787 --local` — starts on `localhost:8787`. Root `/` returns `ok`. The `--local` flag avoids Cloudflare OAuth login; AI and Vectorize bindings are unavailable locally (`not supported`), so `/chat` returns 500 without remote credentials.
- **Hydrogen storefronts** (kazka/zareczyny): `cd apps/<name> && npm run build:css && npx wrangler pages dev ./public --port <port> --local` — starts the Remix SSR worker. Returns 500 without Shopify API tokens (`PUBLIC_STOREFRONT_API_TOKEN`, `SESSION_SECRET`, etc.).

### Building storefronts

`cd apps/kazka && npm run build` (or `apps/zareczyny`). Both build cleanly via PostCSS + Remix.

### Known pre-existing issues

- **TypeScript**: `npm run typecheck` in both Hydrogen apps fails with `StorefrontHeaders` export error in `@shopify/hydrogen` — this is a version mismatch in `packages/utils/src/hydrogen.ts`, not caused by the dev environment.
- **ESLint kazka**: see lint section above.
- **Prettier zareczyny**: `npm run lint` reports ~89 formatting issues (pre-existing).
