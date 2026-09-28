# KAZKA PDP mobile — raport implementacji

**Data:** 2026-09-28  
**Zakres:** Hydrogen `apps/kazka` (bez deployu, bez zmian Shopify Admin).

## Zrzuty ekranu (390×844, `/products/101-10500-1-0-cu`)

| Scenariusz | Przed (produkcja) | Po (lokalnie `npm run dev`) |
|------------|-------------------|-----------------------------|
| Pierwszy ekran | Do wykonania przez operatora | Do wykonania przez operatora |
| Wybór rozmiaru | Do wykonania | Do wykonania |
| Baner zgody + pasek | Do wykonania | Do wykonania |

## Koszyk bez rozmiaru

Gdy produkt ma opcję „Rozmiar” i brak jej w URL, przycisk pokazuje „Wybierz rozmiar” (disabled) i **nie** wysyła `variantId` do `/cart`.

## Czas wykonania (3 / 10 dni)

Kod czyta kolejno:

1. metapole `custom.czas_wykonania` (wartość 3 lub 10),
2. tagi produktu (`3-dni`, `10-dni` itd.),
3. tytuł / handle (z wyłączeniem linii Classic/Lab/Fancy/Gemstone).

Jeśli brak źródła, zdanie pod koszykiem używa frazy „Wykonanie” bez liczby dni — w raporcie loadera (`pdpAudit.leadTime`) widać `source: missing`. **Rekomendacja:** uzupełnić metapole `custom.czas_wykonania` per produkt lub tag 3-dni / 10-dni.

## Wysyłka

Tekst w zdaniu serwisowym pochodzi z treści strony `/pages/wysylka` (Storefront API). Na Soliterze (dev) wstawka zaczyna się od fragmentu o InPost / Envelo — **nie** od „15 zł / 500 zł”; obowiązuje treść strony. Flagi `pdpAudit.shippingLegacy` w loaderze PDP.

## Zwrot vs zmiana rozmiaru

Na karcie: **„Jedna darmowa zmiana rozmiaru”** (bez 14 dni na zwrot — pierścionki na zamówienie).

**Do dopisania przez właściciela (bez zmian w Shopify w tej iteracji):**

- strona `/pages/polityka-zwrotow` — jedna darmowa zmiana rozmiaru zamiast standardowego zwrotu dla pierścionków na zamówienie,
- regulamin sklepu — ten sam zapis prawny.

## Rozmiar 30

Na lokalnym dev (`/products/101-10500-1-0-cu`, 2026-09-28): w chipach rozmiaru **nie ma „30”** — sekwencja przechodzi z **29** na **31**. To wygląda na **dane Shopify** (wartość nie w `options.values`), nie filtr w Hydrogen. Diagnostyka w kodzie: `pdpAudit.sizeAudit` w loaderze PDP.

## Copy — tylko zgłoszenia (bez edycji)

- **„FT Manufactur”** w opisie produktu (HTML z Shopify) — decyzja właściciela.
- **„osobna pracownia”** w banerze EPIR (`OrganicEpirBridge.tsx`) — decyzja właściciela.

## Judge.me

Kazka nie ma jeszcze opinii ani sprzedaży — **brak komponentu na karcie**.

Integracja headless (na później): oficjalny Widget API Judge.me, token w env workera (np. `JUDGEME_API_TOKEN`), loader PDP pobiera recenzje po `external_id` / SKU, render tylko gdy `reviews_count >= 1`. **Nowy sekret wymaga zgody operatora** — nie dodawany w tej iteracji.

## Zmienione pliki (skrót)

- `apps/kazka/app/routes/products.$handle.tsx` — loader, układ panelu, sticky bar
- `apps/kazka/app/components/KazkaProductOptions.tsx`, `KazkaPdpStickyBar.tsx`
- `apps/kazka/app/lib/kazka-pdp-*.ts` — wariant, lead time, wysyłka
- `apps/kazka/app/styles/app.css` — mobile gallery strip, sticky clearance
- `packages/ui` — `ProductForm` placeholder, `ProductCard`/`ProductGrid` `priceLabel`, fragment CMS `maxVariantPrice`
