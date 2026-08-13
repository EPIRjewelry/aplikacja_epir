# Landingi Apex Ads — handoff operacyjny

**Status:** materiał roboczy (mirror do nowych wątków Cursor). Niewiążący do czasu wchłonięcia do kanonu.  
**Ostatnia aktualizacja:** 2026-08-12  
**Czytaj też:** [`docs/kb/DESIGN_TOKENS.md`](../kb/DESIGN_TOKENS.md), [`workers/dynamic-landing-liquid/README.md`](../../workers/dynamic-landing-liquid/README.md), [`FEED_AND_STORE_STRUCTURE.md`](FEED_AND_STORE_STRUCTURE.md), [`GENIALNY_PLAN_CURSOR_GROKA_4_5.md`](GENIALNY_PLAN_CURSOR_GROKA_4_5.md)

## Decyzja robocza (2026-08-12)

**3 aktywne landingu** w ruchu płatnym: `artisan_rings` (pierścionki srebrne), `forest_premium` (reszta srebra), `artisan_gold` (złoto EPIR) — plus mosty EPIR↔Kazka. Pełna strategia: [`GENIALNY_PLAN_CURSOR_GROKA_4_5.md`](GENIALNY_PLAN_CURSOR_GROKA_4_5.md). Poniżej pozostaje mapa techniczna wszystkich seedowanych kluczy (w tym rezerwa / deprecated).

## Cel

Landingi na `l.epirbizuteria.pl` (Tor Apex Ads), mapowane przez `utm_campaign` → metaobiekt Shopify `campaign_landing` → worker `epir-dynamic-landing-liquid`. Historycznie 5 kluczy w seed; **aktywne w Ads: 3** (patrz decyzja robocza powyżej).

## Routing (jedna zasada)

```
URL: https://l.epirbizuteria.pl/?utm_campaign=<KLUCZ>&utm_source=google&utm_medium=...
Worker routuje WYŁĄCZNIE po utm_campaign (nie po utm_medium).
utm_source / utm_medium / utm_term → pixel/D1 (atrybucja kanału), NIE HTML workera.
```

## Mapowanie 5 landingów

| utm_campaign | metaobject handle | szablon | copy / treść |
|--------------|-------------------|---------|--------------|
| `organic_art` | `organic-art-landing` | pełny editorial + formularz współtworzenia | `render-organic-art.ts` |
| `forest_premium` | `forest-premium-landing` | editorial + foundry + most → rings | `landing-copy.ts` |
| `artisan_rings` | `artisan-rings-landing` | bridal + grawer + most → forest | `landing-copy.ts` |
| `artisan_gold` | `artisan-gold-landing` | Technical Authority + Digital Co-creation + szept Kazka | `landing-copy.ts` |

`artisan_new` — **usunięty z konfiguracji routingu** (kod workera + seed `APEX_MAPPING_REMOVED_KEYS`). Nie mapować w Ads.

### Destynacja handlowa: kolekcja złota

| Co | Wartość |
|----|---------|
| URL kanoniczny | `https://epirbizuteria.pl/collections/zlota-bizuteria` |
| Template suffix | `zloto` (`templates/collection.zloto.json`) |
| Rola | Czysty lejek EPIR po landingu `artisan_gold` — siatka + pracownia + CTA → `zaprojektuj` |
| Kazka | **Zakaz** na stronie kolekcji; szept tylko na `l.?utm_campaign=artisan_gold` |
| Filtry | Wyłączone w szablonie (`show_filter: false`) — bez Metal / CLS |
| Seed CTA | `artisan-gold-landing.cta_url` → `/collections/zlota-bizuteria` |

Mapping SSOT seed: `scripts/seed-campaign-landings.mjs` → `APEX_MAPPING` + `shop.metafields.app.campaign_mapping`.

## PMax vs Search (decyzja robocza, do zatwierdzenia z Kickboxem)

| Kanał | Landing / UTM | Uwagi |
|-------|---------------|-------|
| **PMax** | `utm_campaign=forest_premium` (suffix kampanii) | Shopping z GMC → URL **produktów**, nie landing host |
| **Search** | `artisan_rings`, `forest_premium`, `artisan_gold` (3 aktywne — genialny plan) | `organic_art` / `artisan_new` = rezerwa / deprecated w Ads |

Ten sam `utm_campaign` może być współdzielony między kanałami — rozróżnienie w raportach po `utm_medium` (`cpc` vs `pmax`), nie osobnym landingiem.

## Stan operacyjny (2026-08-12)

- **`LANDINGS_ENABLED=true`** na workerze `epir-dynamic-landing-liquid` — pełny HTML na `l.epirbizuteria.pl` przy poprawnym `utm_campaign`. Deploy: 2026-08-12.
- **Google Ads:** Final URL na landingi **nie włączone** — ruch tylko z bezpośrednich linków / testów operatora.
- URL-e live: patrz [`GENIALNY_PLAN_CURSOR_GROKA_4_5.md`](GENIALNY_PLAN_CURSOR_GROKA_4_5.md) § „Stan live”.
- Podgląd przy `LANDINGS_ENABLED=false`: `EPIR_OPERATOR_PANEL_SECRET` + `node scripts/preview-apex-landing.mjs <kampania>` lub cookie po `epir_preview=`.
- Sync sekretu: `node scripts/sync-landing-preview-secret.mjs`
- Podgląd lokalny (bez API): `node scripts/render-landing-local-preview.mjs` → `.preview-html/*.html`

### Architektura wizualna (wdrożona 2026-08-12)

Szczegóły modułów i kolejny krok (grafiki/tekstury): **GENIALNY_PLAN** § „Mapa kodu” i „Następny wątek”.

- Hero: `<picture>` + `fetchpriority="high"` (`hero-picture.ts`)
- Makro: `stone-profile-hero.ts` (media / override map; **nie** mylić z metafieldem gemmologicznym)
- Tekstura: CSS SVG noise (`.texture-organic`) — **brak jeszcze assetów len/kora z CDN**
- Mosty: `landing-sections.ts` + `OrganicEpirBridge.tsx` na Kazce

## Paleta (zatwierdzona roboczo)

Kanon: [`docs/kb/DESIGN_TOKENS.md`](../kb/DESIGN_TOKENS.md) + `workers/dynamic-landing-liquid/src/design-tokens.ts`

- Jasny klimat (`#f1f1f1`, `#f5f5f5`), CTA globalny `#2c684e`
- Hero dark tylko `forest_premium`; reszta light
- `artisan_gold`: złoto `#C9A227` tylko border/ikony, CTA zielony
- `accentStone` per kampania — docelowo z metafieldu kolekcji `Accent Color`; na razie hardcode w `landing-copy.ts`

## Jak edytować

| Co | Gdzie |
|----|-------|
| Nagłówki, manifesto, proces (apex) | `workers/dynamic-landing-liquid/src/landing-copy.ts` |
| organic_art (cały copy + formularz) | `workers/dynamic-landing-liquid/src/render-organic-art.ts` |
| Tytuł strony, CTA URL, product_ids w Shopify | `scripts/seed-campaign-landings.mjs` + `--apex-only` |
| Które produkty / zdjęcia w siatce | `CURATED_HANDLES` w seed → re-seed |
| Hero image organic_art | **placeholder** — pole metaobiektu dopiero po zatwierdzeniu treści/palety |

## Analityka (operator)

- **Nie używamy BigQuery operacyjnie.** Nazwa workera `bigquery-batch` to legacy.
- Atrybucja: **pixel → D1 → Pipelines** (`docs/kb/DATA_AND_ANALYTICS.md`). UTM z URL w zdarzeniach pixel.

## Otwarte / nie wdrożone

- [x] Deploy workera z paletą v1 + `LANDINGS_ENABLED=true` na `l.` (2026-08-12) — **Ads Final URL nadal off**
- [ ] Grafiki Hero 2048 + tekstury organiczne (len/kora) — następny wątek
- [ ] Hero image jako pole `campaign_landing` (organic_art)
- [ ] `accentStone` z metafieldu kolekcji (nie hardcode)
- [ ] Backend formularza współtworzenia (organic_art — UI-only)
- [ ] Zatwierdzenie podziału PMax/Search z Kickboxem

## Decyzje operatora (odłożone)

### PMax ≠ landingi

Poszerzenie zakresu produktów w PMax to **listing groups w Google Ads** + etykiety GMC (`custom_label_2`: Srebro/Zloto), **nie** worker landingu. PMax Shopping i tak linkuje na URL produktów z feedu.

Stan historyczny (audyt repo): asset group `Grupa plików 1` miała tylko **6 SKU** po item ID; docelowy kontrakt to Srebro+Zloto (expand w `marketing-ops.mjs`). Feed GMC ~141 unikalnych produktów (snapshot 2026-08-08).

### `artisan_new` — usunięty z routingu

Kategoria „nowości” nie jest intencją zakupową. **Usunięty** z `landing-copy`, preview i `APEX_MAPPING` (seed: `APEX_MAPPING_REMOVED_KEYS`). Nie tworzyć grup Search. Metaobject w Shopify — opcjonalny cleanup ręczny.

### Search — klucz podziału nieustalony

Heurystyka nazw grup (`planSearchAdGroupSuffixes`) jest tymczasowa. **Ustalony klucz: intencja zakupowa** (np. zaręczyny, pierścionki, złoto, marka ogólna) — nie kategorie sklepu typu „nowości”.

### Walentynki (PMax)

Asset group **Walentynki** — **STOP do lutego 2026**. Nie włączać w Ads przed sezonem.

### GMC — etykiety wysyłki (`custom_label_1`)

`Wysylka_24h` **niedopuszczalne** w feedzie. Realne terminy: **4–7 dni** (standard); wyroby skomplikowane (np. Magiczny Ogród) **~3 tygodnie**.

## Model sklepu (operator — podstawy, 2026-08-11)

**Status:** ustalenia operatora; źródło prawdy dla feedu, Ads i porządkowania. **Nie** interpretować kreatywnie do czasu zakończenia dywagacji operatora.

### Kategorie podstawowe (wyczerpują aktywne produkty)

Te kategorie opisują **cały aktywny katalog** — feed i reklamy powinny się na nich oprzeć (ew. zawężenie per kolekcja np. Gałązki, ale to ten sam towar):

| Kategoria | Uwagi |
|-----------|--------|
| BRANSOLETKI SREBRNE | |
| KOLCZYKI SREBRNE | |
| PIERŚCIONKI/OBRĄCZKI SREBRNE | |
| WISIORY I NASZYJNIKI SREBRNE | |
| BIŻUTERIA ZŁOTA | bez podziału na podkategorie wewnątrz |

### NOWOŚCI — rola operacyjna (nie informacyjna)

- **Nie** jest kategorią marketingową „co nowe w sklepie”.
- **Jest:** źródłem sekcji na home, rezerwuarem **aktywnych** wyrobów, które operator chce sprzedawać — w chaosie ustawień Shopify i własnych reguł.
- Reguła sklepu: tag `nowość` → kolekcja `nowosci-1` (175+ pozycji w API; smart collection).
- **Rzeczywista rola:** wszystkie aktywne i łatwe do wykonania przedmioty **powinny być** w NOWOŚCIACH.
- Landing/reklama „nowości” jako osobny byt — **kwestionowane** przez operatora (patrz decyzje odłożone: `artisan_new`).

### Pozostałe kolekcje (sortowanie, nie osobny asortyment)

Kolekcje typu **Gałązki**, **Planety**, sortowanie **według kamienia** itd. = **te same wyroby** co w kategoriach podstawowych, tylko inne sortowanie.

### Archiwum Inspiracji

- Produkty **sprzedane** (`tag:sprzedane`).
- Powodują bałagan w sklepie; służą jako **inspiracja do zamówień**.
- **Decyzja (wdrożenie w toku):** osobna galeria Hydrogen na `inspiracje.epirbizuteria.pl` (`apps/inspiracje`), snapshot Admin API bez cen, CTA → `https://epirbizuteria.pl/pages/zaprojektuj-swoj-model`.
- Link ze sklepu: snippet `themes/epir-online-store/snippets/archive-inspirations-link.liquid` + Navigation (po theme pull).
- **Nie** Ads / GMC. Deploy Pages + DNS tylko po OK operatora.
- Eksport: `node scripts/export-archive-inspirations.mjs`; CI: `.github/workflows/deploy-inspiracje-archive.yml`.

### Kierunek roboczy (feed / Ads)

- Feed opierać o **kategorie podstawowe** (ew. zawężenie kolekcją reklamową).
- Reklamować według **klucza intencji** — wszystkie aktywne i łatwe do wykonania wyroby (wszystkie powinny być w NOWOŚCIACH operacyjnie).
- **Czekać** na dalsze dywagacje operatora przed kreatywnymi propozycjami.

## Nowy wątek Cursor — prompt startowy

```
Czytaj docs/working/GENIALNY_PLAN_CURSOR_GROKA_4_5.md (SSOT strategii + mapa kodu) oraz ten handoff.
3 landingu + mosty wdrożone 2026-08-12; Ads Final URL OFF. Następny krok: grafiki Hero 2048 i tekstury.
Bez deployu bez mojej zgody.
```
