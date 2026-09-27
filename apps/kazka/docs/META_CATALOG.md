# Meta Catalog — Kazka

## SSOT

**Źródło prawdy:** `D:/marketing/csv/kazka_27_wrzesien.csv` (eksport Shopify Admin — wszystkie warianty).

Nie regeneruj feedu z Admin GraphQL „1 handle = 1 cena”. To gubi próby 9/14/18K i czystości.

## Generowanie feedu Meta

```bash
python scripts/export-kazka-meta-catalog.py
# lub
npm run export:kazka-meta-catalog
```

Domyślnie:

- `--from D:/marketing/csv/kazka_27_wrzesien.csv`
- `--out marketing/csv/kazka-meta-catalog.csv` (+ `.report.json`)

## Kontrakt wiersza

| Meta pole | Źródło SSOT |
|-----------|-------------|
| `id` | **Variant SKU** (unikalny) |
| `item_group_id` | **Handle** produktu |
| `title` | Title + opcje wariantu |
| `price` | Variant Price + ` PLN` |
| `availability` | Variant Inventory Qty |
| `link` | `https://kazka.epirbizuteria.pl/products/{handle}` |
| `image_link` | Variant Image lub pierwsze Image Src produktu |
| `material` / `size` / `pattern` | Option1–3 (próba / rozmiar / jakość) |
| `mpn` | Variant SKU |
| `brand` | Kazka Jewelry |

**1 wiersz CSV = 1 wariant.** Pixel / Purchase `content_ids` = ten sam SKU.

## Upload (R2 + scheduled fetch)

Plik ~147 MB przekracza limit uploadu w Meta UI — użyj **adresu URL** i harmonogramu.

1. Wygeneruj CSV (sekcja wyżej).
2. Wgraj do R2 (ten sam bucket co GMC, **inny klucz** `kazka-meta-catalog.csv`):

```bash
npm run upload:kazka-meta-catalog-r2
# lub z SSOT na dysku D:
KAZKA_META_CSV_PATH=D:/marketing/csv/kazka-meta-catalog.csv npm run upload:kazka-meta-catalog-r2
```

Wymaga `CLOUDFLARE_API_TOKEN` z uprawnieniem R2 Object Write (jak w GitHub Actions GMC feed).

3. Publiczny feed (worker `epir-marketing-ingest`):

`https://epir-marketing-ingest.krzysztofdzugaj.workers.dev/feed/kazka-meta-catalog.csv`

4. Meta Commerce Manager → katalog powiązany z pixel `1320796521913985` → Źródła danych → **Użyj adresu URL** → powyższy URL → **Zastąp plik danych** → harmonogram.

Po zmianie kontraktu `id` (handle → SKU): **zastąp** katalog nowym feedem (stare id-handle przestaną matchować).

## Weryfikacja

1. `*.report.json`: `validation.issueCount === 0`, `metaRows` ≈ liczba wariantów w SSOT.
2. Events Manager: ViewContent z `content_ids` = SKU wybranego wariantu na PDP.
3. Niezależny audyt: porównanie zbioru SKU SSOT ↔ kolumna `id` w CSV.
