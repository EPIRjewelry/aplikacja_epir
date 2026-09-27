# Zamrożenie — konto Google Ads EPIR

**Data apply:** 2026-09-20  
**Decyzja:** operator — plan A–C wykonany; ocena po zamówieniach Shopify, nie po kolumnie Konwersje Ads.  
**Status:** ZAMROŻONE do **2026-10-11** (21 dni od apply; wcześniejsza ocena po **2026-10-04** dopuszczalna tylko odczyt).

## Zasada operatora (2026-09-27) — zgodność z dokumentacją, zakaz łatek

Robi się kontrolę opisaną w dokumentacji Google. Zakaz obejść, które przy danym ustawieniu dokumentacja uznaje za nieskuteczne. Freeze nie usprawiedliwia łatki. Home w PMax: **expansion OFF + page feed** dozwolonych URL, nie kolejne WEBPAGE. Kontrola z dokumentacji wymaga słowa operatora tylko przy budżecie, biddingu lub celach.

## Konto i kampanie

| Pole | Wartość |
|------|---------|
| Customer ID | `5311644752` |
| PMax | `Epir_Forest-Dark` (`23388827034`) — budżet **62 zł/d**, ENABLED |
| Search | `Search-27.04.2026` (`23801073253`) — budżet **15 zł/d**, ENABLED |

## Cele konwersji (potwierdzone operator + API)

- **Primary:** wyłącznie **Purchase** (Google Shopping App Purchase).
- **Secondary:** Begin Checkout, Page View — **nie** w kolumnie Konwersje, **nie** biddable w kampaniach.
- Cele kampanii (obie): wyłącznie **PURCHASE / WEBSITE** jako biddable.
- Strategia: **Maksymalizuj liczbę konwersji** (`MAXIMIZE_CONVERSIONS`) — **nie** Maximize conversion value.

## Final URL expansion (odczyt 2026-09-23)

`Epir_Forest-Dark`: `FINAL_URL_EXPANSION_TEXT_ASSET_AUTOMATION` = **`OPTED_OUT`** (już tak było; mutacji nie było). Mimo tego w oknie 7 dni home ma nadal ~45% kliknięć. Sam przełącznik nie przekierowuje ruchu.

```bash
node scripts/marketing-ops.mjs pmax-url-expansion
```

## Final URL (PMax asset groups)

Zatwierdzona lista — poza nią nic bez pytania operatora (reguła: `.cursor/rules/epir-ads-ask-before-search.mdc`).

| AG | Final URLs |
|----|------------|
| `EPIR_Srebro` | `https://epirbizuteria.pl/collections/pierscionki-obraczki`, PDP turmalin, `https://epirbizuteria.pl/collections/kolekcja-galazki` |
| `EPIR_Zloto` | `https://epirbizuteria.pl/collections/zlota-bizuteria` |

Nie home, nie `l.epirbizuteria.pl`.

## UTM

- **PMax** kampania: suffix `utm_source=google&utm_medium=cpc&utm_campaign=forest_premium` (apply 2026-09-20).
- **Search:** UTM na **grupach reklam** (`brand_search`, `artisan_rings`, `artisan_bands`, `artisan_gold`) — **nie** `forest_premium`.

## Page feed PMax — kontrola dokumentacji (2026-09-27)

`Epir_Forest-Dark`: expansion OFF + **PAGE_FEED** (4 URL freeze) + `TEXT_ASSET_AUTOMATION` OPTED_IN. Nie łatka WEBPAGE.

```bash
node scripts/marketing-ops.mjs pmax-page-feed
node scripts/marketing-ops.mjs pmax-page-feed --apply
```

Stan 2026-09-27: feed `EPIR PMax freeze page feed` (asset set `9139815508`, 4 URL freeze) + `TEXT_ASSET_AUTOMATION` OPTED_IN. API `CampaignAssetSet` zwróciło `INCOMPATIBLE_ADVERTISING_CHANNEL_TYPE` — **dopiąć feed w UI** kampanii (Page feeds), jeśli odczyt `pmax-page-feed` nadal pokazuje `campaignAssetSet: null`.

## Wykluczenie home — wyjątek 2026-09-27

Operator: negatywne kryterium **WEBPAGE** (`URL` **EQUALS**) na 8 wariantach `https://epirbizuteria.pl` / `www` / `http|https` — kampanie **Epir_Forest-Dark** + **Search-27.04.2026** tylko. Bez budżetu, celów, Final URL grup, expansion ani słów negatywnych.

```bash
node scripts/marketing-ops.mjs ads-exclude-home
node scripts/marketing-ops.mjs ads-exclude-home --apply
```

## Negatywy — wyjątek 2026-09-24

Operator: dodać PHRASE do listy współdzielonej **Safety Filter - Marki** (Search + PMax): `kamyki moniki`, `vintage`, używane/second hand/komis/olx, oraz konkurenci z Search 14d (shambala, bijou brigitte, lovrin, …). **Bez** `jubiler`.

```bash
node scripts/marketing-ops.mjs search-negatives add-shared
node scripts/marketing-ops.mjs search-negatives add-shared --apply
```

## Search — negatywy (jedna partia, PHRASE)

30 fraz: naprawy, skup, lombard, zegarki, obce marki (bemoon, elfjoy, …).  
**Nie blokować:** `jubiler` (ani wariantów wrocław).

## Search — lądowania (odczyt 2026-09-20)

Reklamy ENABLED idą głównie na PDP (`pierscionek-galazki-z-czarnym-turmalinem`, obrączki plecionka, złoty szafir). Nie zmieniane w freeze.

## Zakaz bez jawnego „odmroź” operatora w sesji

- Ponowny `/ops/ads-freeze-apply?dryRun=0`
- Mutacja celów konwersji / `primaryForGoal` / campaign conversion goals
- Budżet, tCPA, Maximize conversion value, bidding
- Final URL expansion ON, Recommendations Apply
- `expand` / `expand-metal`, search-themes apply
- `forest-utm live` (już wklejone), `search-utm apply`, `landings-off live`
- G&Y publish masowy
- Final URL / negatywy poza zatwierdzoną listą

## Odczyty dozwolone

- `GET /ops/ads-account-change-audit`
- `GET /ops/search-landing-audit?days=14`
- `GET /ops/pmax-landing-audit?days=14&campaign=Epir_Forest-Dark`
- `GET /ops/search-terms-audit`, `search-negatives-audit` (read-only)
- `GET /ops/ads-freeze-apply?dryRun=1` (plan only)

## Monitoring (po deploy workera)

**PMax per URL** — ile klików idzie na zatwierdzoną czwórkę freeze URL vs reszta:

```bash
node scripts/marketing-ops.mjs pmax-landings --days 14
```

W JSON: `byUrl` (top landing pages), `byNetwork` (`SEARCH`, `YOUTUBE`, `CONTENT`, …), `freezeTargets` (dopasowanie do `FREEZE_*` z `ads-freeze-apply.ts`). Kluczowa metryka: `freezeTargets[].clickSharePct` dla `zlota-bizuteria` i `pierscionki-obraczki`.

**Search lądowania** (bez zmian w freeze):

```bash
node scripts/marketing-ops.mjs search-landings --days 14
```

**Sieci partnerów Search** (read-only): `node scripts/marketing-ops.mjs ads-account-audit` → sekcja `networkSettings`.

Sukces freeze: zamówienia Shopify `google/cpc`, nie kolumna Konwersje Ads.

## Ocena po freeze

- Metryka sukcesu: **opłacone zamówienia Shopify** z `google / cpc`, nie `metrics.conversions` w Ads.
- Worker ingest: `workers/marketing-ingest` — **nie** dedykowany agent Ads; `MarketingAnalystAgent` = tylko metryki GA4/Ads do Iceberg.

## Reguła agenta

Cursor: `.cursor/rules/epir-ads-freeze.mdc`  
Kod bezpiecznika: `workers/marketing-ingest/src/ads-freeze-apply.ts` (`ADS_ACCOUNT_FREEZE_ACTIVE`).
