# Curator — filtry kolekcji Kazka

Rewizor: **Curator** ([`docs/kb/UI_UX_AND_FRONTEND.md`](../../../docs/kb/UI_UX_AND_FRONTEND.md) § Curator).  
Kod: `apps/kazka/app/lib/collection-product-filters.ts`, UI `@epir/ui` `CollectionFilters`.

## Search & Discovery (Admin) — checklist

Włącz storefront filtering dla kolekcji Kazka:

1. **Variant option** — `Próba złota`
2. **Variant option** — `Jakość`
3. **Product metafield** — `custom.masa_bucket` (`0-0.2g`, `0.2-0.5g`, `0.5g+`)
4. **Tag** — kształt (np. `Okrągły`, `Markiza`)
5. **Product type**, **Price**, **Availability**
6. **Taxonomy** `jewelry-material` — tylko jeśli wartości to Yellow/White/Rose gold (nie samo `gold`)

Backfill metafielda masy:

```bash
node scripts/backfill-kazka-masa-bucket-tags.mjs --from-csv
node scripts/backfill-kazka-masa-bucket-tags.mjs --dry-run
node scripts/backfill-kazka-masa-bucket-tags.mjs --apply
```

## Smoke URL (po deploy + S&D)

Bazowy handle kolekcji: `/collections/<handle>` (np. hub `kazka`).

| # | URL | Oczekiwanie | Status |
|---|-----|-------------|--------|
| 1 | `?proba=14` i `?proba=18` | podzbiór, nie całość / nie zero | do weryfikacji live |
| 2 | `?jakosc=LAB` oraz `?jakosc=D/VVS2` | laboratoryjne vs naturalne | do weryfikacji live |
| 3 | `?ksztalt=Okrągły` i `?ksztalt=Markiza` | filtr po tagu kształtu | do weryfikacji live |
| 4 | `?waga=0.2-0.5` | działa po backfillu `custom.masa_bucket` + S&D metafield | po apply + S&D |
| 5 | `?metal=srebro` | brak w UI; parser **ignoruje** legacy | PASS (kod) |
| 6 | UI bez ametyst/opal/… | tylko osie diamentowe | PASS (kod) |
| 7 | `?metal=zloto-zolte` | żywy filtr tylko gdy taxonomy ≠ samo `gold` | FAIL na kolorze (katalog CSV) |

## Werdykt startowy (po implementacji kodu, przed live S&D)

**CURATOR: FAIL** — kod i UI zgodne z katalogiem diamentowym, ale:

- filtr **wagi** wymaga `node scripts/backfill-kazka-masa-bucket-tags.mjs --apply` + S&D **Product metafield** `custom.masa_bucket`;
- filtr **koloru złota** jest martwy przy `jewelry-material = gold` (brak Yellow/White/Rose w eksporcie);
- smoke #1–3 wymagają włączonych filtrów Variant option / Tag / metafield w Search & Discovery.

**CURATOR: PASS** dopiero gdy #1–4 i #5–6 przejdą na production/preview, a #7 albo działa, albo UI koloru zostanie świadomie ukryte po decyzji operatora.

## Poza zakresem

- Filtr szlifu (`gemstone-cut-style` puste).
- Kolorowe kamienie (plan przyszły).
