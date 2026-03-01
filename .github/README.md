# .github — Instrukcja dla maintainerów

Ten katalog zawiera konfiguracje GitHub dla repozytorium `EPIRjewelry/aplikacja_epir`, w tym reguły ochrony gałęzi, szablony zgłoszeń oraz workflow automatyzacji.

---

## Ochrona gałęzi `main` — Ręczne zastosowanie

Po zatwierdzeniu PR zawierającego ten plik, maintainer powinien ręcznie zastosować reguły ochrony gałęzi. Poniżej przedstawiono dwie metody.

### Wymagania wstępne

- Zainstalowane narzędzie [GitHub CLI (`gh`)](https://cli.github.com/)
- Token Personal Access Token (PAT) lub konto z uprawnieniami **administracyjnymi** do repozytorium
- Token musi mieć scope: `repo` (lub `administration:write` dla fine-grained PAT)

---

### Metoda 1: GitHub CLI (`gh api`)

```bash
gh auth login
# lub: export GH_TOKEN=<twój_token>

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
  "required_conversation_resolution": false,
  "lock_branch": false,
  "allow_fork_syncing": false
}
EOF
```

### Metoda 2: `curl` + REST API

```bash
export GH_TOKEN=<twój_token>

curl -X PUT \
  -H "Authorization: Bearer ${GH_TOKEN}" \
  -H "Accept: application/vnd.github+json" \
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
    "required_conversation_resolution": false,
    "lock_branch": false,
    "allow_fork_syncing": false
  }'
```

---

### Weryfikacja zastosowanych reguł

Po zastosowaniu możesz sprawdzić aktualne ustawienia:

```bash
gh api \
  -H "Accept: application/vnd.github+json" \
  -H "X-GitHub-Api-Version: 2022-11-28" \
  /repos/EPIRjewelry/aplikacja_epir/branches/main/protection \
  | jq '{
      enforce_admins: .enforce_admins.enabled,
      required_approving_review_count: .required_pull_request_reviews.required_approving_review_count,
      dismiss_stale_reviews: .required_pull_request_reviews.dismiss_stale_reviews,
      strict_status_checks: .required_status_checks.strict,
      required_contexts: .required_status_checks.contexts
    }'
```

Oczekiwany wynik:

```json
{
  "enforce_admins": true,
  "required_approving_review_count": 1,
  "dismiss_stale_reviews": true,
  "strict_status_checks": true,
  "required_contexts": ["build", "lint", "typecheck"]
}
```

---

### Metoda 3: Workflow automatyczny

Po dodaniu sekretu `GH_TOKEN` do repozytorium (Settings → Secrets and variables → Actions), workflow [apply-branch-protection.yml](workflows/apply-branch-protection.yml) może zostać uruchomiony ręcznie przez maintainera:

```bash
gh workflow run apply-branch-protection.yml --repo EPIRjewelry/aplikacja_epir
```

lub przez interfejs GitHub: Actions → "Apply Branch Protection" → "Run workflow".

---

## Zmiana reguł ochrony

Wszelkie przyszłe zmiany reguł ochrony gałęzi powinny:

1. Być zgłaszane przez [formularz zgłoszenia](ISSUE_TEMPLATE/branch-protection-change.md)
2. Zawierać aktualizację pliku [branch-protection.md](branch-protection.md)
3. Przejść code review przez co najmniej jednego maintainera
4. Zostać zastosowane ręcznie lub przez workflow po zatwierdzeniu

---

## Pliki w tym katalogu

| Plik | Opis |
|---|---|
| `branch-protection.md` | Opis reguł ochrony, payload REST, uzasadnienie |
| `CODEOWNERS` | Przypisanie właścicieli kodu |
| `README.md` | Ten plik — instrukcja dla maintainerów |
| `workflows/apply-branch-protection.yml` | Workflow automatyzujący ustawienie reguł |
| `ISSUE_TEMPLATE/branch-protection-change.md` | Szablon zgłoszenia zmian reguł |
