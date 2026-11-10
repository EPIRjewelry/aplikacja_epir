# Zamek na live — kto publikuje motyw i Admin

Jedna sesja na raz dotyka motywu live (`theme push --allow-live`) i nawigacji / treści w Shopify Admin.
Powód: równoległe sesje Cursor / Kilo nie widzą się nawzajem i nadpisują sobie szablony.

**Zamek trzyma tylko operator.** Agent nie przejmuje i nie zwalnia zamka sam — zgłasza i czeka.

## Stan

| Pole | Wartość |
|---|---|
| Trzyma | — |
| Od | — |
| Zakres | — |
| Wolny? | **TAK** (zwolniony 2026-11-10 15:30) |

## Już wypchnięte na live (nie nadpisuj w ciemno)

Motyw live `#186221691212`. Te pliki na sklepie są **nowsze lub równe** repo — przed `theme push` któregokolwiek z nich zrób `theme pull --only <plik> --path themes/_pulls/<data>` i diff:

| Plik / obiekt | Stan (2026-11-10) — nie nadpisuj starszą kopią |
|---|---|
| `sections/collection-partner-bridge.liquid` | na live; most do Kazki, włączony tylko jako wpis w kolekcji złota |
| `templates/collection.zloto.json` | na live; `partner_bridge` ma `"disabled": true` — **nie usuwaj wpisu** i nie włączaj go z powrotem |
| `sections/epir-cocreate-3steps.liquid` + szablony `index`, `collection.zlota`, `product`, `product.nowy-szablon`, `product.pierscionek-zloto-turmali`, `page.stworz-swoj-pierscionek` | na live; sekcja współtworzenia pod opisem na PDP |
| `sections/collection-lookbook-dynamic.liquid`, `collection-hero-dynamic.liquid`, `stone-profile-embed.liquid` | poprawione **lokalnie w git**, jeszcze nie na live; przed pushem zrób pull tego pliku i diff |
| menu `nowe-menu-testowe` (nagłówek) | „PARTNER: KAZKA JEWELRY" usunięte świadomie, **nie przywracaj**; jest „ZAMÓWIENIA INDYWIDUALNE" → `/pages/zaprojektuj-swoj-model` |
| `blocks/ai_gen_block_9ad009d.liquid`, `ai_gen_block_b9fed9a.liquid`, `ai_gen_block_c53c961.liquid` | usunięte lokalnie; nie wgrywaj ich z powrotem ze starego zrzutu motywu |

## Procedura

1. Przed `theme push --allow-live`, `theme publish` albo zmianą w Admin (menu, strony, metafieldy, SEO): przeczytaj tę tabelę.
2. Jeśli „Wolny?" = **NIE** i zamek należy do innej sesji — **nie pushuj**. Przygotuj pliki lokalnie i powiedz operatorowi, że live jest zajęty.
3. Jeśli „Wolny?" = **TAK** — zgoda operatora z reguły `epir-no-live-without-approval` nadal obowiązuje; sam zamek jej nie zastępuje.
4. Push zawsze `--only <konkretny plik>`; przed nim `theme pull --only <ten sam plik> --path themes/_pulls/<data>` i diff z lokalnym.

## Zwolnienie

Operator wpisuje `Wolny? → TAK`, czyści „Trzyma" i „Zakres". Dopóki tego nie zrobi, zamek obowiązuje niezależnie od tego, ile czasu minęło.
