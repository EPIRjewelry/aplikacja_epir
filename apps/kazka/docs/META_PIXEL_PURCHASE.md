# Meta Pixel — Purchase (checkout Shopify)

Storefront Kazka (Hydrogen) wysyła **ViewContent** i **AddToCart** z `content_ids` = `shopify_handle` (jak w `kazka-meta-catalog.csv`).

**Purchase** nie wystąpi na domenie Hydrogen — płatność kończy się na checkout Shopify.

## Co skonfigurować

1. **Shopify Admin** → Ustawienia → **Customer events** (lub aplikacja Custom Pixel).
2. Dodaj piksel Meta **1320796521913985** (ten sam co na storefrontcie).
3. Na zdarzeniu **checkout_completed** wyślij `Purchase` z:
   - `content_ids`: tablica **handle** produktu (nie variant GID, nie SKU), np. z `line.merchandise.product.handle` w payloadzie checkout.
   - `content_type`: `product`
   - `value` / `currency`: suma zamówienia

## Spójność z katalogiem

`content_ids` muszą być identyczne z kolumną `id` w feedzie Meta (`101-10010-2-3`, nie `gid://shopify/Product/...`).

## Weryfikacja

Events Manager → Test events → dokończ testowe zamówienie → zdarzenie Purchase z poprawnymi `content_ids`.
