# Ruch Ads → monetyzacja (2026-09-27)

Odczyt only. **Zero mutacji Ads.** Spend PMax 14d: **826,48 zł** (1 819 klików). Search: **117 klików**. Zamówienia Shopify `google/cpc` — metryka freeze, nie liczona w tym odczycie.

## Gdzie leci klik (14 dni)

| URL | Kliknięcia | Rura | Monetyzacja dziś |
|-----|------------|------|------------------|
| `https://epirbizuteria.pl/` | PMax **1017 (55,9%)** | Discover 64% całego PMax | Słaba — nie budujemy CRO home |
| PDP turmalin Gałązki | PMax 196 + Search 74 | Shopping / Search RSA | PDP — trust był po angielsku |
| `/collections/pierscionki-obraczki` | PMax **183 (10,1%)** | AG Srebro | Domyślna kolekcja, bez lejka złota |
| `/collections/zlota-bizuteria` | PMax **0**; Search 2 | Final URL AG nie zbiera klików | Szablon `zloto` jest, ruch go omija |
| `/collections/kolekcja-galazki` | PMax **0** | AG sitelink, nie serwowany | — |
| Search home `{ignore}` | 9 (7,7% Search) | brand_search | WEBPAGE exclude już w koncie |

Sieci PMax: Discover 1167, Search (w PMax) 619, YouTube 28. Większość wydatku na home to **Discover**, nie Final URL grup.

Search ENABLED idzie na PDP (turmalin, szafir, plecionka) — nie na `l.epirbizuteria.pl`.

## Inwentarz „w budowie”

| Asset | Stan | Łapie Ads teraz? |
|-------|------|------------------|
| `collection.zloto.json` | Live suffix złota | Nie w tych 14d (0 klików PMax) |
| Manifesto / workshop (`collection.zlota.json`) | W repo, live używa `zloto` | Nie |
| Srebro `pierscionki-obraczki` | Brak własnego szablonu do dziś | **Tak — 183 kliki** |
| PDP (w tym turmalin) | `product.json` | **Tak — największy sensowny udział** |
| `l.` forest / rings / gold | Worker ON, hero z featured product (`hero-picture` srcset do 2048) | **Nie** — Ads Final URL OFF |
| Brakujące zdjęcia Hero 2048 / tekstury | Handoff otwarty | Nie monetyzuje PMax |

## Co jest lokalnie (bez theme push)

- Złoto: CTA hero „Zobacz modele” → `#CollectionProductGrid`; lead bez kliszy „niepowtarzalny”.
- Srebro: nowy [`collection.srebro.json`](../../themes/epir-online-store/templates/collection.srebro.json) — hero, siatka, proces, CTA zaprojektuj. Suffix `srebro` dopiero po „wgraj”.
- PDP: badge po polsku (4–7 dni, Wrocław); czas realizacji włączony (7 dni).

## Landings `l.`

Kod hero jest. Brakuje **dedykowanych kadrów 2048**, nie routingu. Nie podłączamy Final URL w tej rundzie.

## Czego nie ruszono

Budżet, bidding, cele, expansion, listing groups, Final URL.
