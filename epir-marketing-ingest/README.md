# epir-marketing-ingest

Pipeline feedu produktowego **Shopify Admin API → Google Sheets → Google Merchant Center (GMC)** dla kampanii Performance Max.

> **Uwaga o nazwie:** Ten katalog to **lokalny pipeline feedu GMC** (arkusz jako staging przed Merchant Center). Nie mylić z workerem Cloudflare [`workers/marketing-ingest`](../workers/marketing-ingest/README.md), który pobiera **GA4 + Google Ads** do hurtowni Iceberg.

## Kontekst w repo EPIR

| Komponent | Rola |
|-----------|------|
| `epir-marketing-ingest` (ten katalog) | Feed produktowy: Shopify → Sheets → GMC |
| `workers/marketing-ingest` | Ingest GA4/Ads → Pipelines/Iceberg; ops PMax listing groups |
| `workers/marketing-ingest/src/pmax-listing.ts` | Audyt/expand listing groups PMax (`Epir_Forest-Dark`, exclude Kazka) |
| `epir-marketing-agent-service` | Agent analityczny (HTTP do marketing-ingest workera) |

Custom labels z tego feedu (`custom_label_0`, `custom_label_1`) mogą być używane w PMax listing groups i segmentacji kampanii — patrz kontrakt w `pmax-listing.ts`.

## Szybki start

```powershell
cd d:\aplikacja_epir\epir-marketing-ingest
npm install
# Token Shopify: automatycznie z repo root .dev.vars (SHOPIFY_ADMIN_TOKEN + SHOP)
npm run ingest:dry      # podgląd bez zapisu (tytuły z reguł, bez LLM)
npm run ingest:csv      # CSV → epir-marketing-ingest/.output/gmc_feed.csv
npm run ingest:upload   # PUT CSV → R2 epir-gmc-feed/gmc_feed.csv
```

LLM tytułów jest **wyłączony** (`mapping.json` → `titleEnrichment.aiEnabled: false`). Opt-in tylko: `npm run ingest -- --ai` (i wtedy `aiEnabled: true`).

## Wymagane zmienne środowiskowe

| Zmienna | Opis |
|---------|------|
| `SHOPIFY_ADMIN_TOKEN` | **Auto z repo root `.dev.vars`** (custom app `epir_ai`). Aliasy: `SHOPIFY_ADMIN_ACCESS_TOKEN`, `SHOPIFY_ACCESS_TOKEN` |
| `SHOP` | **Auto z `.dev.vars`** — domyślnie `epir-art-silver-jewellery.myshopify.com` |
| `SHOPIFY_PRODUCT_QUERY` | *(opcjonalnie)* Nadpisuje filtr produktów (domyślnie: aktywne, na stanie, bez Kazka/sprzedane — zgodnie z PMax) |

### Google Sheets — uprawnienia

1. Utwórz konto usługi w GCP, włącz **Google Sheets API**.
2. Udostępnij arkusz kontu usługi (e-mail z pola `client_email`) z uprawnieniem **Editor**.
3. W Merchant Center podłącz arkusz jako źródło danych (poza zakresem tego repo).

### Shopify — uprawnienia

Custom app w Shopify Admin → **read_products** (GraphQL Admin API). Metafields odczytywane z namespace `custom` i `shopify` (lista w `config/shopify.json`).

## Struktura projektu

```
epir-marketing-ingest/
  config/
    shopify.json    # sklep, API version, metafields
    sheets.json     # spreadsheetId, zakładka, zakres
    mapping.json    # mapowanie pól + reguły custom_label + kategorie GMC
  src/
    shopify_client.ts   # pobieranie produktów (GraphQL)
    transform.ts        # wzbogacanie + custom labels
    sheets_client.ts    # zapis idempotentny do arkusza
    runner.ts           # orkiestracja pipeline
    config.ts           # loader konfiguracji
    types.ts
  test/
    transform.test.ts
```

## Mapowanie pól

| Shopify / metafield | Pole wewnętrzne | Kolumna Sheets | Pole GMC |
|---------------------|-----------------|----------------|----------|
| `variant.id` | `variantId` | `id` | `id` (`shopify_PL_{variantId}`) |
| `product.title` + reguły/AI | `title` | `title` | `title` |
| `product.descriptionHtml` | `descriptionHtml` | `description` | `description` |
| `onlineStoreUrl` / handle | `productUrl` | `link` | `link` |
| `variant.image` / featured | `imageUrl` | `image_link` | `image_link` |
| `variant.price` | `price` | `price` | `price` (np. `3200.00 PLN`) |
| inventory + lead time | — | `availability` | `in stock` / `out of stock` / `preorder` |
| `product.vendor` | `brand` | `brand` | `brand` |
| `productType` / kolekcje | — | `google_product_category` | `google_product_category` |
| reguły marży | — | `custom_label_0` | `custom_label_0` |
| reguły dostępności | — | `custom_label_1` | `custom_label_1` |
| vendor + tytuł / metafield | — | `custom_label_2` | `custom_label_2` (`Srebro` / `Zloto`) |
| `custom.main_stone` | `gemType` | — | (wejście do tytułu) |
| `custom.metal` | `material` | — | (wejście do tytułu) |
| `custom.design_style` | `craftsmanship` | — | (wejście do tytułu) |
| `custom.czas_dostawy` | `leadTime` | — | (wejście do `custom_label_1`) |
| `shopify.gemstone-type` | `gemstoneTypeTaxonomy` | — | (fallback kamienia) |
| `shopify.jewelry-material` | `jewelryMaterialTaxonomy` | — | (fallback materiału) |

## Custom labels

### `custom_label_0` — marża / ważność

Reguły w `config/mapping.json` → `marginRules`:

| Etykieta | Warunek (uproszczony) |
|----------|------------------------|
| `Hero-Product` | tag `hero` / `best-seller` lub typ „Pierścionek zaręczynowy” |
| `High-Margin` | cena ≥ 2500 PLN |
| `Medium-Margin` | cena ≥ 900 PLN |
| `Low-Margin` | pozostałe |

### `custom_label_1` — dostępność / lead time

Reguły w `config/mapping.json` → `availabilityRules`:

| Etykieta | Warunek |
|----------|---------|
| `Wysylka_24h` | `custom.czas_dostawy` zawiera wzorzec 24h **lub** stan magazynowy ≥ 1 |
| `Wysylka_3_5_dni` | wzorce 3–5 dni |
| `Na_zamowienie_7_dni` | „na zamówienie”, 7+ dni |

### `custom_label_2` — linia metalu (PMax)

| Etykieta | Warunek |
|----------|---------|
| `Srebro` | vendor `EPIR Art Silver Jewellery` / `EPIR Art Jewellery&Gemstone` (bez złota lite w tytule) |
| `Zloto` | vendor `EPIR Art Gold` **lub** tytuł wskazujący złoto lite (jak HS) |

Preferencja: istniejący metafield `mm-google-shopping.custom_label_2` na wariancie (skrypt `scripts/sync-metal-custom-label-2.mjs`).

Zmiana reguł: edytuj `mapping.json` (progi cen, wzorce tekstowe, etykiety) — bez zmiany kodu.

## Wzbogacanie tytułów

Tylko **reguły** (kamień, materiał, rzemiosło, max 150 znaków). Przykład: *„Pierścionek złoty z turmalinem Forest – ręcznie kuty rzemieślniczy”*.

## Automatyczny ingest (GMC pull)

1. GitHub Action [`.github/workflows/gmc-feed.yml`](../.github/workflows/gmc-feed.yml) — cron `0 6,18 * * *` UTC: Shopify Admin → CSV (bez LLM) → R2 `epir-gmc-feed/gmc_feed.csv`.
2. Worker `epir-marketing-ingest` serwuje **gotowy** plik: `GET /feed/gmc_feed.csv` (bez Admin API w requeście).
3. GMC: źródło **`gmc_feed_scheduled`** (`10707020909`) — Scheduled fetch `GET https://epir-marketing-ingest.krzysztofdzugaj.workers.dev/feed/gmc_feed.csv` (codziennie 07:00 UTC). Stary upload `gmc_feed.csv` i Content API mają Shopping wyłączone.

Sekrety GH (istniejące nazwy): `SHOPIFY_ADMIN_TOKEN`, `CLOUDFLARE_API_TOKEN`, `CLOUDFLARE_ACCOUNT_ID`.

## Testy

```powershell
npm test
npm run typecheck
```

## Governance (repo EPIR)

- Sekrety **nie** commituj — tylko `.env` lokalnie lub secret storage operatora.
- Zgodnie z [`AGENTS.md`](../AGENTS.md): Google Sheets służy tu jako **staging feedu GMC**, nie jako ledger analityki (SSOT analityki: D1 → Iceberg).
- Nowe nazwy sekretów w Cloudflare wymagają zgody operatora (`.cursor/rules/epir-secrets-governance.mdc`).
