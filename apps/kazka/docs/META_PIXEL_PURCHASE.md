# Meta Pixel — Purchase (checkout Shopify)

Storefront Kazka (Hydrogen) wysyła **ViewContent** i **AddToCart** z `content_ids` = **Variant SKU** (kolumna `id` w `kazka-meta-catalog.csv` z SSOT `kazka_27_wrzesien.csv`).

**Purchase** nie wystąpi na domenie Hydrogen — płatność kończy się na checkout Shopify.

## 1. Custom Pixel (kanoniczny snippet w repo)

1. Shopify Admin → **Settings** → **Customer events** → **Add custom pixel**.
2. Wklej całą treść pliku [`custom-pixels/meta-purchase.pixel.js`](../custom-pixels/meta-purchase.pixel.js).
3. Pixel ID w skrypcie: **1320796521913985** (jak [`meta-pixel-id.ts`](../app/lib/meta-pixel-id.ts)).
4. Zapisz i **Connect** / opublikuj pixel w sklepie.

Skrypt wysyła `Purchase` na `checkout_completed` **tylko** gdy atrybut koszyka `_epir_storefront` = `kazka` (ustawiany w Hydrogen przy dodaniu do koszyka — [`@epir/utils`](../../../../packages/utils/src/epir-cart-attributes.ts)).

Pola zdarzenia:

- `content_ids`: **SKU** wariantu (`line.merchandise.sku` / `line.sku`); fallback handle tylko gdy brak SKU
- `content_type`: `product`
- `value` / `currency`: suma checkoutu
- `eventID`: `purchase_{orderId}` — **ta sama wartość** co serwerowe CAPI (deduplikacja)

Zamówienia z apex / Zaręczyn (bez `kazka` w atrybucie) **nie** wysyłają Purchase na ten pixel.

## 2. Conversions API (serwer)

Worker analityki (`workers/analytics`) po webhooku `orders/create` wysyła **Purchase** do Meta CAPI gdy `_epir_storefront=kazka` w `note_attributes` / `custom_attributes` zamówienia (fallback: heurystyka URL dla starych koszyków).

Sekrety (produkcja — po OK operatora):

```bash
cd workers/analytics
wrangler secret put META_CAPI_ACCESS_TOKEN
# opcjonalnie podczas testów w Events Manager:
wrangler secret put META_CAPI_TEST_EVENT_CODE
# opcjonalnie lookup handle gdy webhook nie ma handle w line_items:
wrangler secret put SHOPIFY_ADMIN_TOKEN
```

Bez `META_CAPI_ACCESS_TOKEN` webhook działa jak dotąd (tylko `order_attributions`).

## 3. Katalog Meta

SSOT + eksport — patrz [`META_CATALOG.md`](META_CATALOG.md):

```bash
python scripts/export-kazka-meta-catalog.py --from D:/marketing/csv/kazka_27_wrzesien.csv
```

Upload w **Meta Commerce Manager** → katalog powiązany z pixel **1320796521913985**.

## Spójność z katalogiem

`content_ids` = kolumna `id` = **Variant SKU** (np. `104-10692 S-14-karatow-gemstone`), nie GID i nie sam handle.

## Weryfikacja

1. Events Manager → **Test events** → testowe zamówienie z `kazka.epirbizuteria.pl`.
2. Sprawdź **Purchase** z poprawnymi `content_ids` i jednym zdarzeniem po dedup (browser + CAPI = jeden `event_id`).
