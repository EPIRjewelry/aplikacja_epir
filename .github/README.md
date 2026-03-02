# Konfiguracja GitHub — EPIRjewelry/aplikacja_epir

Ten katalog zawiera konfigurację GitHub dla repozytorium: workflow CI/CD, szablony zgłoszeń oraz dokumentację reguł ochrony gałęzi.

## Spis treści

- [Ochrona gałęzi `main`](#ochrona-gałęzi-main)
- [Ręczne zastosowanie reguł przez maintainerów](#ręczne-zastosowanie-reguł-przez-maintainerów)
- [Automatyczne zastosowanie przez workflow](#automatyczne-zastosowanie-przez-workflow)
- [Weryfikacja aktualnych reguł](#weryfikacja-aktualnych-reguł)
- [Zgłaszanie zmian reguł](#zgłaszanie-zmian-reguł)
- [Automatyzacja CI/CD i maintenance](#automatyzacja-cicd-i-maintenance)

---

## Ochrona gałęzi `main`

Szczegółowy opis reguł ochrony i uzasadnienie biznesowe znajduje się w pliku [branch-protection.md](branch-protection.md).

### Podsumowanie reguł

| Reguła | Wartość |
|--------|---------|
| Wymagane recenzje PR | 1 |
| Wymagane sprawdzenia statusu | `build`, `lint`, `typecheck` |
| Gałąź aktualna przed scaleniem | tak |
| Podpisane commity | nie |
| Historia liniowa | nie |
| Odrzucanie nieaktualnych zatwierdzeń | tak |
| Ograniczenie pushowania | brak |
| Wymuszanie dla adminów | tak |

> **Ważne:** Nazwy wymaganych status checks muszą **dokładnie** odpowiadać nazwom jobów/reportów w CI.
> Jeśli w repo są inne nazwy, zaktualizuj `contexts` przed zastosowaniem reguł.

---

## Ręczne zastosowanie reguł przez maintainerów

### Wymagania wstępne

- [GitHub CLI (`gh`)](https://cli.github.com/) zainstalowany lokalnie
- Token GitHub z uprawnieniami `repo` (pełne) lub fine-grained: `administration:write`
- Zalogowanie: `gh auth login`

### Krok 1 — Zastosuj reguły ochrony przez `gh api`

```bash
gh api \
  --method PUT \
  -H "Accept: application/vnd.github+json" \
  -H "X-GitHub-Api-Version: 2022-11-28" \
  /repos/EPIRjewelry/aplikacja_epir/branches/main/protection \
  --input - <<'EOF'
{
  "required_status_checks": {
    "strict": true,
    "contexts": ["build", "lint", "typecheck"]
  },
  "enforce_admins": true,
  "required_pull_request_reviews": {
    "dismiss_stale_reviews": true,
    "require_code_owner_reviews": false,
    "required_approving_review_count": 1
  },
  "restrictions": null,
  "required_linear_history": false,
  "allow_force_pushes": false,
  "allow_deletions": false,
  "required_conversation_resolution": false
}
EOF
```

### Krok 2 — Weryfikacja zastosowanych reguł

```bash
gh api \
  -H "Accept: application/vnd.github+json" \
  -H "X-GitHub-Api-Version: 2022-11-28" \
  /repos/EPIRjewelry/aplikacja_epir/branches/main/protection \
  | jq '{
      required_status_checks: .required_status_checks.contexts,
      strict: .required_status_checks.strict,
      enforce_admins: .enforce_admins.enabled,
      required_approving_review_count: .required_pull_request_reviews.required_approving_review_count,
      dismiss_stale_reviews: .required_pull_request_reviews.dismiss_stale_reviews
    }'
```

Oczekiwany wynik:

```json
{
  "required_status_checks": ["build", "lint", "typecheck"],
  "strict": true,
  "enforce_admins": true,
  "required_approving_review_count": 1,
  "dismiss_stale_reviews": true
}
```

### Alternatywnie — przez `curl` z REST API

```bash
curl -L \
  -X PUT \
  -H "Accept: application/vnd.github+json" \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -H "X-GitHub-Api-Version: 2022-11-28" \
  https://api.github.com/repos/EPIRjewelry/aplikacja_epir/branches/main/protection \
  -d '{
    "required_status_checks": {
      "strict": true,
      "contexts": ["build", "lint", "typecheck"]
    },
    "enforce_admins": true,
    "required_pull_request_reviews": {
      "dismiss_stale_reviews": true,
      "require_code_owner_reviews": false,
      "required_approving_review_count": 1
    },
    "restrictions": null,
    "required_linear_history": false,
    "allow_force_pushes": false,
    "allow_deletions": false,
    "required_conversation_resolution": false
  }'
```

> **Uwaga:** Zastąp `YOUR_TOKEN` swoim osobistym tokenem GitHub (nigdy nie commituj tokenu do repozytorium).

---

## Automatyczne zastosowanie przez workflow

Workflow [`apply-branch-protection.yml`](workflows/apply-branch-protection.yml) pozwala zastosować reguły automatycznie przez GitHub Actions.

### Konfiguracja sekretu `GH_TOKEN`

1. Wejdź w: **Settings → Secrets and variables → Actions → New repository secret**
2. Nazwa sekretu: `GH_TOKEN`
3. Wartość: Personal Access Token (classic) z uprawnieniami `repo` (pełne)  
   lub fine-grained token z uprawnieniem `administration:write` dla tego repozytorium.

> **Ważne:** Token nie jest przechowywany w plikach repozytorium. Musi być dodany ręcznie przez administratora repozytorium.

### Uruchomienie workflow

1. Przejdź do zakładki **Actions** w repozytorium.
2. Wybierz workflow **Apply Branch Protection**.
3. Kliknij **Run workflow**.
4. Wybierz tryb:
   - `dry_run=true` (domyślnie) — wypisuje payload bez wprowadzania zmian (bezpieczny podgląd).
   - `dry_run=false` — zastosowuje reguły do gałęzi `main`.

---

## Weryfikacja aktualnych reguł

Aby sprawdzić aktualnie obowiązujące reguły ochrony gałęzi `main`:

```bash
gh api \
  -H "Accept: application/vnd.github+json" \
  /repos/EPIRjewelry/aplikacja_epir/branches/main/protection
```

Lub przez interfejs webowy:  
**Settings → Branches → Branch protection rules**

---

## Rollback (przywrócenie mniej restrykcyjnych ustawień)

Jeśli po wdrożeniu reguł merge PR-ów zostanie nieoczekiwanie zablokowany, wykonaj rollback:

```bash
gh api \
  --method PUT \
  -H "Accept: application/vnd.github+json" \
  -H "X-GitHub-Api-Version: 2022-11-28" \
  /repos/EPIRjewelry/aplikacja_epir/branches/main/protection \
  --input - <<'EOF'
{
  "required_status_checks": null,
  "enforce_admins": true,
  "required_pull_request_reviews": {
    "dismiss_stale_reviews": false,
    "require_code_owner_reviews": false,
    "required_approving_review_count": 1
  },
  "restrictions": null,
  "required_linear_history": false,
  "allow_force_pushes": false,
  "allow_deletions": false,
  "required_conversation_resolution": false
}
EOF
```

Następnie ponownie zweryfikuj konfigurację poleceniem z sekcji **Weryfikacja aktualnych reguł**.

---

## Zgłaszanie zmian reguł

Aby zgłosić propozycję zmiany reguł ochrony gałęzi, utwórz nowe zgłoszenie używając szablonu:  
[**Branch Protection Change**](ISSUE_TEMPLATE/branch-protection-change.md)

Każda zmiana wymaga zatwierdzenia przez co najmniej jednego maintainera repozytorium.

---

## Automatyzacja CI/CD i maintenance

W repozytorium przygotowano dodatkowe workflowy wspierające codzienną pracę zespołu:

- `workflows/ci.yml` — pipeline CI z jobami `build`, `lint`, `typecheck`.
- `dependabot.yml` — automatyczne PR-y z aktualizacjami zależności.
- `workflows/triage-labeler.yml` + `labeler.yml` — automatyczne etykietowanie PR-ów.
- `workflows/stale.yml` — cykliczne porządki nieaktywnych issue/PR.

Plan wdrożeń kolejnych etapów (CD/preview/security/performance/release) znajduje się w:
`AUTOMATION_ROADMAP.md`.
