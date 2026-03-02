name: Apply Branch Protection
description: Zastosuj reguły ochrony gałęzi main używając GitHub REST API
title: "[Branch Protection] Zmiana reguł ochrony gałęzi main"
labels: ["branch-protection", "maintenance"]
assignees: []
body:
  - type: markdown
    attributes:
      value: |
        ## Zgłoszenie zmiany reguł ochrony gałęzi

        Użyj tego formularza, aby zgłosić propozycję zmiany reguł ochrony gałęzi `main`.
        Każda zmiana wymaga zatwierdzenia przez co najmniej jednego maintainera.

  - type: textarea
    id: current-rules
    attributes:
      label: Aktualne reguły
      description: Opisz, które reguły chcesz zmienić (obecny stan).
      placeholder: "np. Wymagane recenzje PR: 1"
    validations:
      required: true

  - type: textarea
    id: proposed-rules
    attributes:
      label: Proponowane reguły
      description: Opisz nowe wartości reguł, które chcesz zastosować.
      placeholder: "np. Wymagane recenzje PR: 2"
    validations:
      required: true

  - type: textarea
    id: justification
    attributes:
      label: Uzasadnienie
      description: Dlaczego ta zmiana jest potrzebna? Jaki problem rozwiązuje lub jaką wartość przynosi?
    validations:
      required: true

  - type: textarea
    id: risks
    attributes:
      label: Potencjalne ryzyka
      description: Czy zmiana może negatywnie wpłynąć na istniejący proces pracy zespołu?
      placeholder: "np. Wymóg 2 recenzentów może spowolnić wdrożenia przy małym zespole."

  - type: checkboxes
    id: checklist
    attributes:
      label: Lista kontrolna
      options:
        - label: Zmiany są opisane w `.github/branch-protection.md`
          required: false
        - label: Przetestowałem/am workflow w trybie `dry_run=true`
          required: true
        - label: Zmiana została omówiona z maintainerem repozytorium
          required: true
        - label: Przygotowałem/am plan rollback na wypadek blokady merge
          required: true
        - label: Jestem świadomy/a, że zmiana dotyczy gałęzi produkcyjnej `main`
          required: true
