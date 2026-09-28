# Zamrożenie — PDP apex (motyw Online Store)

**Data:** 2026-09-28  
**Decyzja:** operator — stan karty produktu (pracownia + galeria mobile) uznany za produkcyjny.  
**Status:** ZAMROŻONE

## Zakaz

Bez **wyraźnego polecenia** operatora w bieżącej sesji:

- zmian estetycznych i copy na PDP apex (Liquid, CSS w snippecie, JSON szablonów),
- `theme push` / mutacji Admin API na szablony produktu,
- kolejnych łat galerii (`!important`, wymuszanie paginacji w Liquid, patch vendor JS).

## Kotwice wersji

| Element | Wartość |
|---------|---------|
| Git tag | `pdp-apex-2026-09-28` |
| SHA | `9d722919e67813d72295eaa9a3ec23e80039762e` |
| Motyw live | `#186221691212` |
| Szablon srebro | `product.nowy-szablon` (`template.suffix` = `nowy-szablon`) |
| Szablon złoto (przykład) | `product.pierscionek-zloto-turmali` |

## Pliki w repo (freeze)

- `themes/epir-online-store/sections/main-product.liquid`
- `themes/epir-online-store/snippets/main-product-blocks.liquid`
- `themes/epir-online-store/snippets/product-option.liquid`
- `themes/epir-online-store/snippets/sticky-atc.liquid`
- `scripts/theme-pdp-patch.mjs`

## Tylko na Shopify (poza whitelistą gita)

- `templates/product.nowy-szablon.json` — m.in. `show_pagination_mobile: true` (default schematu Minimoga).
- Treści zakładek / `custom_css` w JSON szablonów — nie trzymać jako SSOT w repo.

## Ustalenia galerii mobile (nie cofać bez diagnozy)

1. Paginacja: ustawienie sekcji `show_pagination_mobile` (nie override Liquid).
2. Bez `opacity: 1 !important` na `.swiper-container` — vendor fade-in po `on.init`.
3. Pierścionki (brak preselect rozmiaru): disabled fallback `name="id"` dostaje `gallery_variant_id` = `selected_or_first_available_variant.id`; input w formularzu ATC zostaje pusty do wyboru rozmiaru (`disable_selected_variant_default`). Workaround na coupling Minimoga (`product-media-mobile.js` → pierwszy `[name="id"]`).

## Weryfikacja referencyjna

- Pierścionek (rozmiar): `/products/pierscionek-srebrny-z-duzym-szmaragdem`
- Bransoletka (bez rozmiaru): `/products/bransoletka-galazki-z-ametystem`

## Powiązane

- Audyt telefon: [`PDP_THEME_TELEFON_2026-09-28.md`](PDP_THEME_TELEFON_2026-09-28.md)
- Publish live: tylko po OK — `.cursor/rules/epir-no-live-without-approval.mdc`
