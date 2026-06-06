# EPIR Hybrid Attribution Mesh (HAM)

**Status:** kanoniczny opis warstwy atrybucji (Project B + pixel). Strażnicy: **EDCG** (kontrakt kolumn), **EDOG** (zdrowie przepływu), **Store Steward** (konsumpcja biznesowa).

## Trzy warstwy

| Warstwa | Rola | Mutuje `pixel_events`? |
|---------|------|------------------------|
| **A — deterministyczny rdzeń** | UTM, referrer, click IDs, `last_non_direct` per sesja | Zapisuje kolumny `traffic_*`, `click_id*` |
| **B — rekonsyliacja** | Łączenie sesji z Ads/GA (`marketing-ingest` preview / hurtownia) | Nie |
| **C — probabilistyczna** | Porównanie deterministic vs suggested (`@epir/ham-core`) | **Nie** — tylko sygnały pochodne |

## Implementacja w repo

| Etap | Ścieżka |
|------|---------|
| A | [`extensions/my-web-pixel/src/index.ts`](../extensions/my-web-pixel/src/index.ts), [`workers/analytics`](../workers/analytics/), migracja [`005_pixel_events_attribution.sql`](../workers/analytics/migrations/005_pixel_events_attribution.sql) |
| B–D | [`workers/store-steward/src/aggregate-ham.ts`](../workers/store-steward/src/aggregate-ham.ts), [`packages/ham-core`](../packages/ham-core/) |
| Logika współdzielona | `@epir/ham-core` (`parseAttribution`, `toResolvedAttribution`, `compareDeterministicVsProbabilistic`) |

## Pola kanoniczne (serving / Steward)

- **Operacyjne (raw):** `traffic_source`, `traffic_medium`, `traffic_campaign`, `click_id`, `click_id_type`
- **Raportowe (derived):** `resolved_source`, `resolved_medium`, `resolved_campaign` — wyliczane w SQL Steward (`ham-sql.ts`), nie nadpisują raw

## Bramki PASS (operator)

| Etap | Kryterium |
|------|-----------|
| A | Testy vitest pixel + analytics; UTM/gclid w D1; `last_non_direct` na drugim evencie direct |
| B | Sygnał `ham_marketing_ads_reconcile` gdy skonfigurowano `MARKETING_INGEST_ORIGIN` + `MARKETING_OPS_PREVIEW_KEY` na store-steward |
| C | Sygnał `ham_probabilistic_comparison` — `note: derived_only_no_raw_mutation` |
| D | `ham_paid_unknown_share` &lt; **20%** (`PAID_UNKNOWN_THRESHOLD`) — insight `TRUST` gdy FAIL |

## Migracja D1 (produkcja)

```bash
cd workers/analytics
npx wrangler d1 execute jewelry-analytics-db --remote --file=./migrations/005_pixel_events_attribution.sql
npx wrangler deploy
cd ../store-steward
npx wrangler deploy
```

## Meta-narrator (Curator)

Curator (meta-narrator): [`docs/kb/UI_UX_AND_FRONTEND.md`](kb/UI_UX_AND_FRONTEND.md) § Curator — interpretacja całości (Gemma, landingi, sprzedaż), bez zastępowania Kustosza ani ESOG.
