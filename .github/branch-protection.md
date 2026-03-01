# Ochrona gałęzi `main` — Ustawienia i uzasadnienie

## Uzasadnienie biznesowe

Gałąź `main` jest gałęzią produkcyjną. Wszelkie zmiany trafiające bezpośrednio do `main` bez przeglądu kodu zwiększają ryzyko błędów krytycznych, awarii i utraty danych. Wdrożenie reguł ochrony gałęzi zapewnia:

- **Jakość kodu** — każda zmiana musi przejść co najmniej jeden przegląd (code review) przez innego członka zespołu.
- **Stabilność CI** — merge jest możliwy wyłącznie po pomyślnym przejściu wszystkich wymaganych sprawdzeń: `build`, `lint`, `typecheck`.
- **Aktualność gałęzi** — gałąź funkcjonalna musi być up-to-date z `main` przed scaleniem, co eliminuje konflikty po stronie CI.
- **Egzekwowanie reguł dla adminów** — nawet administratorzy podlegają tym samym regułom, co zmniejsza ryzyko przypadkowego push do `main`.

---

## Docelowe reguły ochrony gałęzi

| Reguła | Wartość |
|---|---|
| Wymagane recenzje przed merge | **1** (minimum) |
| Odrzucaj nieaktualne recenzje przy nowym commit | **true** |
| Wymagane sprawdzenia statusu przed merge | `build`, `lint`, `typecheck` |
| Gałąź musi być aktualna przed merge | **true** |
| Wymagane podpisane commity | **false** |
| Wymagaj liniowej historii | **false** |
| Ogranicz, kto może pushować | **brak ograniczeń** |
| Egzekwuj dla adminów | **true** |

---

## Payload REST API (GitHub Branch Protection)

Poniższy JSON należy wysłać metodą `PUT` na endpoint:

```
PUT /repos/EPIRjewelry/aplikacja_epir/branches/main/protection
```

```json
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
```

---

## Instrukcja zastosowania

Szczegółowe kroki ręcznego wdrożenia przez maintainera opisane są w pliku [README.md](README.md).

Workflow automatyczny (po merge do `main`) opisany jest w [workflows/apply-branch-protection.yml](workflows/apply-branch-protection.yml).
