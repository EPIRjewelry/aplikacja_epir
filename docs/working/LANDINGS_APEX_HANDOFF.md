# Landingi Apex Ads — handoff operacyjny

**Status:** materiał roboczy (mirror do nowych wątków Cursor). Niewiążący do czasu wchłonięcia do kanonu.  
**Ostatnia aktualizacja:** 2026-08-10  
**Czytaj też:** [`docs/kb/DESIGN_TOKENS.md`](../kb/DESIGN_TOKENS.md), [`workers/dynamic-landing-liquid/README.md`](../../workers/dynamic-landing-liquid/README.md)

## Cel

5 landingów na `l.epirbizuteria.pl` (Tor Apex Ads), mapowanych przez `utm_campaign` → metaobiekt Shopify `campaign_landing` → worker `epir-dynamic-landing-liquid`.

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
| `forest_premium` | `forest-premium-landing` | editorial + proces 4 kroki | `landing-copy.ts` |
| `artisan_rings` | `artisan-rings-landing` | j.w. | `landing-copy.ts` |
| `artisan_new` | `artisan-new-landing` | j.w. (copy **już jest**) | `landing-copy.ts` |
| `artisan_gold` | `artisan-gold-landing` | j.w., detal kamienia `#C9A227`, CTA zielony | `landing-copy.ts` |

Mapping SSOT seed: `scripts/seed-campaign-landings.mjs` → `APEX_MAPPING` + `shop.metafields.app.campaign_mapping`.

## PMax vs Search (decyzja robocza, do zatwierdzenia z Kickboxem)

| Kanał | Landing / UTM | Uwagi |
|-------|---------------|-------|
| **PMax** | `utm_campaign=forest_premium` (suffix kampanii) | Shopping z GMC → URL **produktów**, nie landing host |
| **Search** | `organic_art`, `artisan_rings`, `artisan_new`, `artisan_gold` (heurystyka nazwy grupy w `workers/marketing-ingest/src/pmax-listing.ts` → `planSearchAdGroupSuffixes`) | Final URL suffix per grupa |

Ten sam `utm_campaign` może być współdzielony między kanałami — rozróżnienie w raportach po `utm_medium` (`cpc` vs `pmax`), nie osobnym landingiem.

## Stan operacyjny (2026-08-10)

- `LANDINGS_ENABLED=false` na produkcji → klienci: **302 na pierwszy produkt** z kuracji; pełny HTML tylko z podglądem operatora.
- Podgląd operatora: `EPIR_OPERATOR_PANEL_SECRET` na workerze + `node scripts/preview-apex-landing.mjs <kampania>` lub cookie sesji po `epir_preview=`.
- Sync sekretu: `node scripts/sync-landing-preview-secret.mjs`
- **Nowa paleta v1** (jasna, `#2c684e` CTA) — w kodzie lokalnie, **bez deployu** do czasu „OK” operatora.
- Podgląd lokalny (nowa paleta): `node scripts/render-landing-local-preview.mjs` → `.preview-html/*.html`

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

- [ ] Deploy workera z paletą v1 + włączenie landings dla klientów (`LANDINGS_ENABLED=true`) — po OK operatora
- [ ] Hero image jako pole `campaign_landing` (organic_art)
- [ ] `accentStone` z metafieldu kolekcji (nie hardcode)
- [ ] Backend formularza współtworzenia (organic_art — UI-only)
- [ ] Zatwierdzenie podziału PMax/Search z Kickboxem

## Decyzje operatora (odłożone)

### PMax ≠ landingi

Poszerzenie zakresu produktów w PMax to **listing groups w Google Ads** + etykiety GMC (`custom_label_2`: Srebro/Zloto), **nie** worker landingu. PMax Shopping i tak linkuje na URL produktów z feedu.

Stan historyczny (audyt repo): asset group `Grupa plików 1` miała tylko **6 SKU** po item ID; docelowy kontrakt to Srebro+Zloto (expand w `marketing-ops.mjs`). Feed GMC ~141 unikalnych produktów (snapshot 2026-08-08).

### `artisan_new` — pod znakiem zapytania

Kategoria „nowości” w sklepie nie uzasadnia osobnego bytu reklamowego. **Nie tworzyć** nowych mapowań/grup bez pytania operatora. Decyzja końcowa: zostawić w kodzie / usunąć z Search / scalić z innym wzorcem.

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

- Produkty **sprzedane**.
- Powodują bałagan w sklepie; służą jako **inspiracja do zamówień**.
- Ewentualna osobna strona + link — **odrębny temat**, nierozstrzygnięty.

### Kierunek roboczy (feed / Ads)

- Feed opierać o **kategorie podstawowe** (ew. zawężenie kolekcją reklamową).
- Reklamować według **klucza intencji** — wszystkie aktywne i łatwe do wykonania wyroby (wszystkie powinny być w NOWOŚCIACH operacyjnie).
- **Czekać** na dalsze dywagacje operatora przed kreatywnymi propozycjami.

## Nowy wątek Cursor — prompt startowy

```
Czytaj docs/working/LANDINGS_APEX_HANDOFF.md, docs/kb/DESIGN_TOKENS.md i workers/dynamic-landing-liquid/README.md.
Kontynuuj pracę nad landingami Apex bez deployu bez mojej zgody.
```
