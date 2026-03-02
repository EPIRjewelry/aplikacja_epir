# Branch Protection — gałąź `main`

## Opis ustawień

Poniższe reguły ochrony są stosowane dla gałęzi `main` w repozytorium `EPIRjewelry/aplikacja_epir`.

| Reguła | Wartość |
|--------|---------|
| Wymagane recenzje PR przed scaleniem | **1** (minimalna liczba recenzentów) |
| Wymagane sprawdzenia statusu przed scaleniem | `build`, `lint`, `typecheck` |
| Gałąź musi być aktualna przed scaleniem | **tak** |
| Wymagane podpisane commity | nie |
| Wymagana historia liniowa | nie |
| Odrzucanie nieaktualnych zatwierdzeń PR po nowych commitach | **tak** |
| Ograniczenie kto może pushować | brak ograniczeń |
| Wymuszanie reguł także dla adminów | **tak** |

> **Uwaga operacyjna:** wartości `build`, `lint`, `typecheck` muszą odpowiadać faktycznym nazwom statusów/jobów CI w repozytorium.

## Uzasadnienie biznesowe

### 1. Wymagane recenzje PR (min. 1 recenzent)
Zapewnia, że każda zmiana wdrożona do produkcji przeszła co najmniej jedną dodatkową weryfikację przez innego członka zespołu. Zmniejsza ryzyko błędów, poprawia jakość kodu i ułatwia transfer wiedzy w zespole.

### 2. Wymagane sprawdzenia statusu (`build`, `lint`, `typecheck`)
Gwarantuje, że żaden kod, który nie przechodzi automatycznych testów, nie trafi do gałęzi głównej. Chroni przed regresją i utrzymuje spójność bazy kodu.

### 3. Gałąź musi być aktualna przed scaleniem
Wymusza, aby PR zawierał najnowsze zmiany z `main` przed scaleniem. Zapobiega sytuacji, gdzie nowo scalony kod koliduje z poprzednio zatwierdzonymi zmianami.

### 4. Odrzucanie nieaktualnych zatwierdzeń
Jeśli po zatwierdzeniu PR pojawią się nowe commity, wcześniejsze zatwierdzenie jest unieważniane i wymagana jest ponowna recenzja. Zapobiega ominięciu recenzji przez drobne zmiany po zatwierdzeniu.

### 5. Wymuszanie reguł dla adminów
Zapewnia, że nawet administratorzy repozytorium podlegają tym samym zasadom. Chroni przed przypadkowym lub pośpiesznym wdrożeniem zmian z pominięciem procesu recenzji.

## Procedura zmiany reguł

Aby zmienić reguły ochrony gałęzi:

1. Utwórz zgłoszenie używając szablonu [branch-protection-change](ISSUE_TEMPLATE/branch-protection-change.md).
2. Opisz proponowaną zmianę i uzasadnienie.
3. Uzyskaj zgodę co najmniej jednego maintainera repozytorium.
4. Zastosuj zmianę ręcznie zgodnie z instrukcją w [.github/README.md](.github/README.md) lub przez workflow [apply-branch-protection.yml](.github/workflows/apply-branch-protection.yml).
