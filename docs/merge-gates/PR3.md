# Merge Gate — PR3 (dokumentacja i kontrakty)

## Status integracji release gates (CI)

- **Stan:** w toku / oczekuje na dyktandę architektury.
- **Szablon do wypełnienia przez właściciela polityki:** [`PR3-ARCHITECTURE-DICTATION.md`](PR3-ARCHITECTURE-DICTATION.md).
- **Wdrożone w repo (szkielet + częściowa egzekucja):**
  - `pr3-secret-scan` — skan repozytorium ([Gitleaks](https://github.com/gitleaks/gitleaks-action) w `.github/workflows/pr3-release-gates.yml`).
  - `wrangler-prod-policy` — walidacja `workers_dev`, `[vars]` i bindingów ([`scripts/ci/validate-wrangler-prod-policy.py`](../../scripts/ci/validate-wrangler-prod-policy.py), workflow `.github/workflows/deploy-policy.yml`).
  - `post-deploy-smoke` — po `deploy-workers` w `.github/workflows/deploy.yml`; skrypt [`scripts/smoke/post-deploy-smoke.mjs`](../../scripts/smoke/post-deploy-smoke.mjs); wymagane sekrety: `SMOKE_BASE_URL`, `SMOKE_RAG_HEALTH_URL`, `SMOKE_EPIR_CHAT_SHARED_SECRET` (szczegóły: [`docs/EPIR_DEPLOYMENT_AND_OPERATIONS.md`](../EPIR_DEPLOYMENT_AND_OPERATIONS.md), Faza 5).
- **Branch protection:** po uruchomieniu *Apply Branch Protection* wymagany jest też kontekst `pr3-secret-scan` (obok `wrangler-prod-policy`). Dopóki reguły nie zostaną zastosowane na GitHubie, nowy check jest *szkieletem w workflow*, nie „twardym” gate na serwerze.

## Cel karty

Ta karta definiuje scope i kryteria merge dla PR3 tak, aby PR nie był odrzucany jako "out of scope", jeśli dotyka wyłącznie dokumentacji/merge gates.

## Dozwolony zakres (in-scope)

- `docs/EPIR_DEPLOYMENT_AND_OPERATIONS.md`
- `docs/EPIR_INGRESS_AND_RUNTIME.md`
- `docs/README.md`
- `docs/merge-gates/**`

## Zakres niedozwolony (out-of-scope dla tego gate)

- zmiany runtime kodu (`workers/**`, `apps/**`, `packages/**`, `extensions/**`),
- zmiany sekretów, bindingów i infrastruktury wykonywane jako część tego PR,
- zmiany migracji SQL.

## Kryteria PASS

1. Dokumenty odzwierciedlają aktualny kod 1:1 dla kontraktów:
   - błąd `502` z payloadem `session_lifecycle_failed`,
   - TokenVault lookup (`404` dla brakującego tokenu, mapowanie payloadu do `{ customerId, shopId }`),
   - deterministyczne shardowanie TokenVault (`shop:${normalize(shopId)}`; cutover/replay na znormalizowanym `shopId`).
2. `EPIR_DEPLOYMENT_AND_OPERATIONS.md` zawiera opis profili `staging/production` dla 4 plików:
   - `workers/chat/wrangler.toml`
   - `workers/rag-worker/wrangler.toml`
   - `workers/analytics/wrangler.toml`
   - `workers/bigquery-batch/wrangler.toml`
3. W dokumentacji jest jawny sygnał conformance CI dla ingressu:
   - `tests/ingress-conformance.mjs`,
   - `tests/app-proxy-conformance.mjs`.
4. Brak zmian poza katalogiem `docs/` (z wyjątkiem tej karty w `docs/merge-gates/`).

## Decyzja

- **PASS**: wszystkie kryteria spełnione.
- **CHANGES_REQUIRED**: dowolne kryterium niespełnione lub stwierdzony rozjazd dokumentacja vs kod.
