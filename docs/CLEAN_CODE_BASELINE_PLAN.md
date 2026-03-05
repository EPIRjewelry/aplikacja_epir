# Clean Code Baseline Plan

Cel: oddzielić porządki jakości kodu od zmian deploy/CI, żeby utrzymać małe i bezpieczne PR-y.

## Zakres

1. Aplikacje `apps/kazka` i `apps/zareczyny`

   - uporządkowanie konfiguracji ESLint (spójny format i jedna konwencja plików)
   - stabilizacja TypeScript (`typecheck` bez błędów)
   - redukcja ostrzeżeń i błędów linta blokujących CI

2. Monorepo quality gates
   - utrzymanie zasad: deploy PR-y nie powinny dotykać długów aplikacyjnych
   - oddzielne PR-y na refaktoryzację i poprawki semantyczne

## Plan wykonania (małe kroki)

1. Zebrać aktualny raport błędów lint/typecheck dla obu aplikacji.
2. Naprawiać błędy partiami (najpierw typy krytyczne, potem lint).
3. Po każdej partii uruchamiać checki lokalnie i w CI.
4. Mergować tylko gdy checki dla scope clean-code są zielone.

## Kryterium zamknięcia PR

- `lint` i `typecheck` dla `apps/kazka` i `apps/zareczyny` przechodzą.
- Brak zmian w deploy workflow, chyba że wynikają bezpośrednio z napraw jakości.
