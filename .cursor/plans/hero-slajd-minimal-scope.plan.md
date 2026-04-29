---
name: Hero/slajd minimal scope
overview: Twarde zasady zakresu dla problemu pustego hero na stronie głównej Zareczyny oraz wykonana minimalna naprawa kodu.
isProject: false
---

# Twarde zasady minimalnego zakresu (EPIR / Zareczyny hero)

1. **Nie rozciągać prac** ponad jedną, udokumentowaną przyczynę techniczną naraz.
2. **Nie edytować plików poza** tymi wymienionymi w punkcie naprawczym.
3. **Nie poszerzać zakresu**: brak refactorów stylistycznych, brak zmian w kazka, pakietach `@epir/ui` (oprócież gdy przyczyna jest tam — tu nie jest), CSP, root, `_index.tsx`, ani Admin-only treści kodem.
4. **Zasada minimalnych zmian naprawczych**: wyłącznie linijki konieczne do naprawy błędu (np. brak fallbacku URL).

## Przyczyna techniczna (graf + kod)

fragment GraphQL `MediaImage` w [`SECTION_HERO_FRAGMENT`](packages/ui/src/sections/fragments.ts) zwraca `image { url }` oraz `previewImage { url }`. Komponent brał wyłącznie `image.url`; gdy Shopify zwraca tylko preview — tło pozostaje puste.

## Wykonanie (jedna zmiana kodu)

- Plik: [`apps/zareczyny/app/components/HeroWithCollectionTiles.tsx`](apps/zareczyny/app/components/HeroWithCollectionTiles.tsx)
- Zmiana: dla `__typename === 'MediaImage'` ustawić URL tła na `mediaRef.image?.url ?? mediaRef.previewImage?.url` (z rozszerzeniem typu `HeroDataType` o `previewImage`).
- Pozostałe przypadki (kolekcje bez `image`, CSP): **nie w tym zakresie** — wymaga danych w Admin lub analizy DevTools osobno.
