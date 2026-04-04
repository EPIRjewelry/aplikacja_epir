# Shopify Admin API 2026-04+ — kontrakty wymuszające uwagę w EPIR

Ten dokument zbiera **fakty platformowe**, które wpływają na orthodoksję danych i uprawnień. Jest wtórny wobec `EPIR_AI_ECOSYSTEM_MASTER.md` i `EPIR_AI_BIBLE.md`, ale uzupełnia je o szczegóły z oficjalnej dokumentacji Shopify.

## Limity zapisu: metafields typu `json`

- Od **API `2026-04` i nowszych** zapisy wartości metafields typu **`json` są ograniczone do 128 KB** na operację zapisu.
- Inne typy metafields zachowują swoje limity (por. [Metafield limits](https://shopify.dev/docs/apps/build/metafields/metafield-limits)).
- Źródło: [JSON metafield values limited to 128KB](https://shopify.dev/changelog/reduced-metafield-value-sizes).

**Implikacja dla EPIR:** nowe lub rozbudowane konfiguracje nie powinny być monolitycznymi blobami JSON na produkcie, jeśli mogą zbliżać się do limitu — preferuj **metaobjects** i **reference metafields**.

## App-owned metaobjects a access scopes

- Od **API `2026-04` i nowszych** metaobjects należące do aplikacji (typy z prefiksem `$app:`, w tym z deklaratywnych definicji) mogą być używane przez **owning app bez dodatkowych access scopes** do odczytu i zapisu.
- **Merchant-owned** metaobjects nadal wymagają odpowiednich scope'ów (np. `read_metaobjects`, `write_metaobjects`, definicje).
- Źródło: [App-owned metaobjects can be used without access scopes](https://shopify.dev/changelog/metaobject-scopes-not-required-for-app-metaobjects).

**Implikacja dla EPIR:** przy projektowaniu nowych struktur rozróżniaj explicite app-owned vs merchant-owned; nie zakładaj automatycznie, że każdy metaobject wymaga `read_metaobjects` w `shopify.app.toml`, jeśli jest w namespace aplikacji i używasz `2026-04+`.

## Rozszerzenia w tym repozytorium (Checkout / Customer Account)

Aktualnie `shopify.app.toml` wskazuje wyłącznie:

- `extensions/asystent-klienta` — **Theme App Extension** (`type = "theme"`),
- `extensions/my-web-pixel` — **Web Pixel Extension**.

**Nie ma** w repo Checkout UI Extension ani Customer Account UI Extension. Wymóg migracji do **Preact + web components** i limit **64 KB** bundle dotyczy tych typów rozszerzeń — nie Theme App Extension ani storefrontów Hydrogen.

## Audit repozytorium (json metafields — zapis)

Przeszukanie kodu pod kątem mutacji Admin API zapisujących metafields typu `json` **nie wykazało** wywołań w stylu `metafieldsSet` / `metafieldCreate` z typem `json` w plikach źródłowych TypeScript/GraphQL w scope EPIR.

Storefronty odczytują metafields (np. `collection_enhanced` jako referencja) — to **odczyt**, nie podlega limitowi zapisu `128 KB` w tym samym sensie co mutacje Admin API.

**Rekomendacja:** przy każdej nowej integracji zapisującej duże JSON-y do metafields zweryfikuj rozmiar i rozważ metaobjects.

## Dependabot a zmiany architektoniczne Shopify

Ostatnie zgłoszone PR-y Dependabota w tym repo (**#61–#52**) dotyczą głównie:

- podbić wersji w `package.json` / `package-lock.json`,
- aktualizacji GitHub Actions.

Nie wdrażają one samodzielnie: migracji danych Shopify, zmian w `shopify.app.toml` pod nowe scope’y, ani nowych kontraktów GraphQL w logice biznesowej. Merge zależności wymaga osobnej weryfikacji buildu (`shopify app build`, `wrangler`, testy).
