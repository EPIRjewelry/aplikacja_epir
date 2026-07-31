# EPIR — domeny storefrontów (kanon Shopify)

**Status:** wiążący dla deployu i ADS. Źródło: [Shopify Hydrogen — migrate / redirect traffic](https://shopify.dev/docs/storefronts/headless/hydrogen/migrate/redirect-traffic).

## Zasada (bez własnego routera na apex)

| Domena | Target | Technologia |
|--------|--------|-------------|
| `epirbizuteria.pl` | **Shopify Online Store** (bezpośrednio) | Motyw Liquid + TAE (czat Gemma) |
| `zareczyny.epirbizuteria.pl` | **Cloudflare Pages** | Hydrogen (`apps/zareczyny`) |
| `kazka.epirbizuteria.pl` | **Cloudflare Pages** | Hydrogen (`apps/kazka`) |
| Checkout | Shopify (subdomena lub `checkout.shopify.com`) | `PUBLIC_CHECKOUT_DOMAIN` w Hydrogen |

**Zakaz:** workerów ani reverse proxy na `epirbizuteria.pl/*`, które przejmują ruch przed Shopify. Apex musi iść **bezpośrednio** do sklepu — jak w dokumentacji Shopify dla hostingu headless **poza Oxygen**.

## Dlaczego nie `/zareczyny` na apex

Shopify opisuje ścieżki URL (`/fr`, `/es`) w ramach **jednego** storefrontu Hydrogen (Markets), albo **domenę główną na Hydrogen** przy pełnej migracji. Mieszanie motywu Liquid na `/` i Hydrogen na `/zareczyny` przez własny router **nie jest** w kanonie Shopify.

## Google Ads i analityka

- Kampanie na **główną markę** → final URL na `https://epirbizuteria.pl/...` (motyw).
- Kampanie na **Zaręczyny / Kazka** → final URL **bezpośrednio** na subdomenę Hydrogen (`https://zareczyny.epirbizuteria.pl/...`) — **bez** łańcucha redirectów w feedzie (Google Merchant / feed rules w Shopify Admin).
- Cross-domain w GA4 / HAM: osobne hosty w jednym property lub rekonsyliacja w [`EPIR_HAM_ATTRIBUTION.md`](EPIR_HAM_ATTRIBUTION.md) — nie proxy na apex.

## Deploy (operator)

```bash
# Hydrogen — osobne subdomeny w Cloudflare Pages (custom domains)
npm run pages:deploy:zareczyny
npm run pages:deploy:kazka

# Motyw główny — pull/push (nie przez worker)
# themes/epir-online-store/README.md

# Aplikacja Shopify (TAE, pixel) — bez zmian
shopify app deploy
```

**Nie wdrażaj** `storefront-apex-router` ani podobnych workerów na apex.

## Metafieldy i treść

Wspólne dane w Adminie: [`EPIR_ADMIN_METAFIELDS_CHECKLIST.md`](EPIR_ADMIN_METAFIELDS_CHECKLIST.md).

## Powiązane

- [`EPIR_AI_ECOSYSTEM_MASTER.md`](../EPIR_AI_ECOSYSTEM_MASTER.md)
- [`docs/kb/UI_UX_AND_FRONTEND.md`](kb/UI_UX_AND_FRONTEND.md)
- [`themes/epir-online-store/README.md`](../themes/epir-online-store/README.md)
