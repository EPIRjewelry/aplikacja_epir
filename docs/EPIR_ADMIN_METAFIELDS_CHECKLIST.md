# Checklist metafieldów — Admin Shopify (wspólne dla motywu + Hydrogen)

**Zasada:** uzupełniasz dane **raz w Adminie**; motyw (`themes/epir-online-store`) i Hydrogen (`apps/zareczyny`, `apps/kazka`) tylko je czytają.

Szczegóły wizualne: [`REVIEW.md`](../../REVIEW.md). Implementacja referencyjna kolekcji: [`apps/zareczyny/app/routes/collections.$handle.tsx`](../../apps/zareczyny/app/routes/collections.$handle.tsx).

## Kolekcje pod kampanie ADS (handle’e kanoniczne)

Używaj **tych samych** handle’ów w Google Ads i w kodzie:

| Handle | Rola |
|--------|------|
| `pierscionki-zareczynowe` | Hub Zaręczyny |
| `zareczyny-zlote` | Podkolekcja złoto |
| `zareczyny-srebrne` | Podkolekcja srebro |

URL produkcyjny:  
`https://zareczyny.epirbizuteria.pl/collections/pierscionki-zareczynowe`

## Metaobject `collection_enhanced` (kolekcja)

Powiązanie: metafield kolekcji `custom.collection_enhanced` → metaobject.

Pola używane w Hydrogen (klucze w metaobject):

| Klucz pola | Opis |
|------------|------|
| `name` | Nazwa wyświetlana |
| `philosophy` | Tekst / rich text (JSON root) |
| `accent_color` | HEX akcentu kolekcji |
| `hero_video` | Referencja media (wideo) |
| `texture_overlay` | Obraz tekstury (kanał alpha) |
| `lookbook_images` | Lista referencji obrazów |

## Produkt

| Metafield | Namespace.key | Opis |
|-----------|---------------|------|
| Profil kamienia | `custom.stone_profile` | Makro struktury kamienia (REVIEW) |

## Kroki operatora

1. Shopify Admin → **Settings → Custom data** — definicje metaobject / metafieldów.
2. Opublikuj wpisy metaobject (status **Active**) w kanale Headless + Online Store.
3. Przypisz `collection_enhanced` do kolekcji hub i podkolekcji.
4. Uzupełnij media 2048×2048 wg REVIEW (produkt, lifestyle, makro).
5. Smoke: otwórz kolekcję na `zareczyny.epirbizuteria.pl/collections/...` — hero i lookbook widoczne.

Narzędzia IDE: plugin Shopify (skille `shopify-admin`, `shopify-custom-data`) — bez ręcznego `shopify-dev-mcp` w `mcp.json`.
