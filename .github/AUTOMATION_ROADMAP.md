# Roadmap automatyzacji (PR A/B/C/D)

Ten dokument dzieli wdrożenie automatyzacji na mniejsze PR-y o niskim ryzyku.

## PR A — CI + maintenance (ten PR)

Zakres:
- `CI` (`build`, `lint`, `typecheck`) dla `apps/kazka` i `apps/zareczyny`
- Dependabot (`npm` + `github-actions`)
- Auto-labeling PR (`actions/labeler`)
- Scheduled maintenance (`actions/stale`)

Pliki:
- `.github/workflows/ci.yml`
- `.github/dependabot.yml`
- `.github/labeler.yml`
- `.github/workflows/triage-labeler.yml`
- `.github/workflows/stale.yml`

Sekrety wymagane: brak (wykorzystywany jest wbudowany `GITHUB_TOKEN`).

## PR B — CD + Preview

Zakres:
- Workflow deploy do środowiska docelowego
- Workflow preview dla PR

Status:
- Rozpoczęty jako draft (workflowy: `workflows/deploy.yml`, `workflows/preview.yml`)
- Wersja startowa obejmuje Cloudflare Workers + Cloudflare Pages
- Shopify deploy pozostaje manualnie (kolejny etap PR B)

Wymagane przed merge:
- Uzupełnienie sekretów hostingu/deploy (np. Cloudflare/Shopify/Vercel/Netlify)
- Ustalenie mapowania środowisk (preview/staging/prod)

## PR C — Security + quality gates

Zakres:
- Security scanning (dependency + code scanning)
- Performance gates (np. Lighthouse CI)
- Visual regression (np. Chromatic/Percy)

Wymagane przed merge:
- Baseline wydajności i progów
- Integracja z usługą do przechowywania wyników/snapshotów

## PR D — Release automation

Zakres:
- Automatyczny changelog + semver + publikacja release

Wymagane przed merge:
- Token/uprawnienia do tworzenia release
- Uzgodniona strategia wersjonowania (np. Conventional Commits)
