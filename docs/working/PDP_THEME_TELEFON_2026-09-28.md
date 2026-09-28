# Karta produktu (motyw) — audyt telefon 390px

**Data:** 2026-09-28 (aktualizacja: pracownia PDP)  
**Sklep:** epirbizuteria.pl  
**Praca:** lokalna (`shopify theme pull` + `shopify theme dev`), **bez `theme push`**, live nietknięty.

## Podgląd lokalny

- Dev server: http://127.0.0.1:9292
- Theme dev (sync): https://epir-art-silver-jewellery.myshopify.com/?preview_theme_id=206665089356

### Produkty testowe

| Produkt | Suffix szablonu (oczekiwany) | Lokalny podgląd |
|---------|------------------------------|-----------------|
| Opal (srebro) | `nowy-szablon` | http://127.0.0.1:9292/products/pierscionek-z-opalem-etiopskim |
| Rubin Gałązki (złoto) | `pierscionek-zloto-turmali` *(sprawdź przypisanie w Admin)* | http://127.0.0.1:9292/products/pierscionek-zloty-z-rubinem-galazki |

**Suffix złoto / srebro:** w Liquid `template.suffix` — srebro `nowy-szablon`, złoto (przykład w motywie) `pierscionek-zloto-turmali`. Tagów produktu nie zmieniano.

---

## Iteracja 2 — pracownia (plan 390px)

### A. Blok pod koszykiem (5 linii + ikony)

W `snippets/main-product-blocks.liquid` (blok `buy_buttons`):

1. Ręcznie we Wrocławiu, specjalnie dla Ciebie  
2. Czas wykonania: 7 dni roboczych  
3. Wysyłka: **złoto** — darmowa, ubezpieczona dostawa · **srebro** — 15 zł, darmowa od 500 zł  
4. Jedna bezpłatna zmiana rozmiaru  
5. Telefon: [698 718 564](tel:+48698718564)

Pickup availability nadal ukryty (`display: none`).

### B. Usunięcia / wysyłka

- Z treści zakładek w `product.nowy-szablon.json` i `product.pierscionek-zloto-turmali.json`: usunięto zdania o zwrotach / 14 dni (skrypt `scripts/theme-pdp-patch.mjs`); nagłówek „Wysyłka i Zwroty” → „Wysyłka”.
- `show_ask_a_question: false` na obu szablonach (telefon w bloku A).
- `show_shipping_text: false` na obu szablonach (bez powtórzenia wysyłki pod blokiem shipping).
- Srebro: `date_format` → `%d.%m.%Y`.

### C. Przegląd UX

| Element | Plik | Uwagi |
|---------|------|--------|
| `mm` małe | `product-option.liquid` | `<span class="epir-size-unit">mm</span>`, CSS `text-transform: none` |
| Mniejsze chipy rozmiaru | `main-product-blocks.liquid` + `custom_css` w szablonach JSON | padding ~0.35rem, font ~0.8125rem |
| Sticky mobile srebro | `sticky-atc.liquid` | placeholder „Wybierz rozmiar”, brak preselect gdy `disable_selected_variant_default` |
| Data PL (srebro) | patch JSON | `%d.%m.%Y` |
| Koszyk bez rozmiaru | `main-product-blocks.liquid` | puste `value` na `[name=id]` + JS `preventDefault` + „Wybierz rozmiar” |

### D. Grawer (złoto)

- Ustawienie sekcji `epir_engraving` w `sections/main-product.liquid` — **default false**.
- W szablonie `product.pierscionek-zloto-turmali.json`: `epir_engraving: true`.
- Pole `properties[Grawer]`, max 20 znaków; disclaimer art. 38 pkt 3 **tylko pod grawerem**.

### E. Weryfikacja w sesji

- Lokalny `:9292` zwracał stronę **Upload Errors** (dev już nasłuchuje na porcie, sync wymaga restartu po zmianach).
- **Do domknięcia przez operatora:** viewport 390px — pozycja Y przycisku ATC (opal + rubin), sticky ATC na srebrze, submit koszyka bez wyboru rozmiaru (brak dodania pierwszego wariantu).

---

## Zmienione pliki (commit / whitelist)

| Plik | Zmiana |
|------|--------|
| `themes/epir-online-store/snippets/main-product-blocks.liquid` | Blok pracowni, grawer, walidacja rozmiaru, puste id wariantu |
| `themes/epir-online-store/snippets/product-option.liquid` | mm, brak preselect rozmiaru, `data-epir-size-option` |
| `themes/epir-online-store/snippets/sticky-atc.liquid` | Placeholder wariantu w sticky |
| `themes/epir-online-store/sections/main-product.liquid` | Schema `epir_engraving` |
| `themes/epir-online-store/templates/product.json` | `disable_selected_variant_default: true` |
| `themes/epir-online-store/templates/product.nowy-szablon.json` | Patch: addons/shipping/data/zwroty/kontakt |
| `themes/epir-online-store/templates/product.pierscionek-zloto-turmali.json` | Patch + `epir_engraving: true` |
| `scripts/theme-pdp-patch.mjs` | Patch JSON (pracownia) |

Ponowny patch: `node scripts/theme-pdp-patch.mjs` z root repo.

---

## Push na live

Tylko po słowie operatora („wgraj”) — selektywny `theme push` zmienionych plików.
