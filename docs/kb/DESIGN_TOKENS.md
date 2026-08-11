# EPIR Design Tokens v1

**Status:** kanon roboczy — zatwierdzony przez operatora (landingi Apex Ads, 2026-08).  
**Implementacja:** `workers/dynamic-landing-liquid/src/design-tokens.ts` (lustro 1:1).  
**Kontekst marki:** [`REVIEW.md`](../../REVIEW.md), [`UI_UX_AND_FRONTEND.md`](UI_UX_AND_FRONTEND.md).

## Zasady

- **Jasny klimat** — spójny z `epirbizuteria.pl` (beże, ecru, ciepłe szarości), nie „luxury dark”.
- **CTA globalny** — zielony `#2c684e` na wszystkich landingach (konwersja > estetyka per kampania).
- **Akcent kamienia** — per kampania (`epir-accent-stone`), tylko border / ikona / detal; źródło docelowe: metafield kolekcji `Accent Color`.
- **Hero** — `epir-hero-mode: light | dark` per renderer (jasne tło organic/artisan; overlay `#2c684e` dla forest/premium).

## Tokeny bazowe

| Token | Hex | Użycie |
|-------|-----|--------|
| `epir-bg-primary` | `#f1f1f1` | tło główne, hero light |
| `epir-bg-secondary` | `#f5f5f5` | sekcje naprzemienne, karty |
| `epir-bg-accent` | `#2c684e` | hero dark, sekcje akcentowe |
| `epir-bg-cream` | `#f0ebe0` | cieplejszy wariant artisan / manifesto |
| `epir-text-primary` | `#222222` | nagłówki, body |
| `epir-text-muted` | `#666666` | podtytuły, opisy |
| `epir-on-accent` | `#ffffff` | tekst na ciemnym tle / CTA |
| `epir-accent` | `#2c684e` | CTA, linki — globalny |
| `epir-accent-hover` | `#3c5629` | hover CTA, ceny |
| `epir-field` | `#f2f2f1` | pola formularza |
| `epir-accent-stone` | *per kampania* | border, ikony procesu; domyślnie `#2c684e`; złoto `#C9A227` tylko jako kamień (`artisan_gold`) |

## Hero per kampania (Apex)

| `utm_campaign` / handle | `epir-hero-mode` | `epir-accent-stone` (domyślne) |
|-------------------------|------------------|--------------------------------|
| `organic_art` | `light` | `#2c684e` |
| `forest_premium` | `dark` | `#2c684e` |
| `artisan_rings` | `light` | `#2c684e` |
| `artisan_new` | `light` | `#2c684e` |
| `artisan_gold` | `light` | `#C9A227` (detal; CTA zielony) |

## Stosowanie sekcji

- **Hero light** → `bg-primary`, tekst `text-primary`
- **Hero dark** → `bg-accent`, tekst `on-accent`
- **Sekcje naprzemienne** → `bg-primary` / `bg-secondary`
- **CTA** → `bg-accent` + `text-on-accent`; hover `accent-hover`
- **Outline** → border `accent`; hover lekki fill `accent/8`

## Zmiany

Każda zmiana tokenów: ten plik + `design-tokens.ts` + komentarz w `render-shared.ts`. Deploy landingów dopiero po podglądzie operatora (`preview-apex-landing.mjs`).
