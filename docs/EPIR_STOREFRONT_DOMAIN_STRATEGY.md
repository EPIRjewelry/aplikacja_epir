# EPIR — domeny storefrontów (kanon Shopify)

**Status:** wiążący dla deployu i ADS. Źródło: [Shopify Hydrogen — migrate / redirect traffic](https://shopify.dev/docs/storefronts/headless/hydrogen/migrate/redirect-traffic).

## Zasada (apex → Shopify; subdomeny → Cloudflare)

| Domena | Target | Technologia |
|--------|--------|-------------|
| `epirbizuteria.pl` | Shopify Online Store (+ opcjonalny worker HTMLRewriter) | Motyw Liquid + TAE; po Gate 0: `epir-dynamic-landing-liquid` |
| `zareczyny.epirbizuteria.pl` | **Cloudflare Pages** | Hydrogen (`apps/zareczyny`) |
| `kazka.epirbizuteria.pl` | **Cloudflare Pages** | Hydrogen (`apps/kazka`) |
| Checkout | Shopify (subdomena lub `checkout.shopify.com`) | `PUBLIC_CHECKOUT_DOMAIN` w Hydrogen |

**Domyślnie:** apex idzie do Shopify. **Nie wdrażaj** ogólnego `storefront-apex-router` ani workerów, które robią redirecty między storefrontami.

### Wyjątek: `epir-dynamic-landing-liquid` (campaign HTMLRewriter)

Świadomy wyjątek od zakazu reverse proxy na apex — **tylko** po migracji DNS (Gate 0):

1. Strefa CF `epirbizuteria.pl`: rekord apex **Proxied** → origin Shopify (`.myshopify.com` / `shops.myshopify.com`).
2. SSL/TLS: **Full (strict)** (cert edge CF; Shopify-managed cert na apex nie jest już widoczny dla klienta).
3. Workers Route `epirbizuteria.pl/*` → `epir-dynamic-landing-liquid`.
4. Worker fetchuje origin na `SHOPIFY_STOREFRONT_DOMAIN` (`.myshopify.com`), mutuje HTML in-place (UTM → `campaign_mapping` → metaobject). **Bez redirectów.**
5. Blocklist: `/checkout`, `/cart`, `/apps/*`, `/account/*`, metody ≠ GET/HEAD — zawsze pass-through.

Kod: [`workers/dynamic-landing-liquid`](../workers/dynamic-landing-liquid). Operacje: README workera (Gate 0, Faza A/B).

Bez Gate 0 (apex DNS-only / nameservery poza CF) trasa workera **nie przechwyci** ruchu — deploy kodu jest bezpieczny, aktywacja trasy nie.

## Dlaczego nie `/zareczyny` na apex

Shopify opisuje ścieżki URL (`/fr`, `/es`) w ramach **jednego** storefrontu Hydrogen (Markets), albo **domenę główną na Hydrogen** przy pełnej migracji. Mieszanie motywu Liquid na `/` i Hydrogen na `/zareczyny` przez własny router **nie jest** w kanonie Shopify.

## Google Ads i analityka

- Kampanie na **główną markę** → final URL na `https://epirbizuteria.pl/...` (motyw; opcjonalnie UTM personalizacja przez HTMLRewriter).
- Kampanie na **Zaręczyny / Kazka** → final URL **bezpośrednio** na subdomenę Hydrogen (`https://zareczyny.epirbizuteria.pl/...`) — **bez** łańcucha redirectów w feedzie (Google Merchant / feed rules w Shopify Admin).
- Cross-domain w GA4 / HAM: osobne hosty w jednym property lub rekonsyliacja w [`EPIR_HAM_ATTRIBUTION.md`](EPIR_HAM_ATTRIBUTION.md).

## Deploy (operator)

```bash
# Hydrogen — osobne subdomeny w Cloudflare Pages (custom domains)
npm run pages:deploy:zareczyny
npm run pages:deploy:kazka

# Motyw główny — pull/push
# themes/epir-online-store/README.md

# Dynamic landing Liquid (Faza A: kod; Faza B: dopiero po Gate 0)
# workers/dynamic-landing-liquid/README.md

# Aplikacja Shopify (TAE, pixel) — bez zmian
shopify app deploy
```

## Metafieldy i treść

Wspólne dane w Adminie: [`EPIR_ADMIN_METAFIELDS_CHECKLIST.md`](EPIR_ADMIN_METAFIELDS_CHECKLIST.md).

## Powiązane

- [`EPIR_AI_ECOSYSTEM_MASTER.md`](../EPIR_AI_ECOSYSTEM_MASTER.md)
- [`docs/kb/UI_UX_AND_FRONTEND.md`](kb/UI_UX_AND_FRONTEND.md)
- [`themes/epir-online-store/README.md`](../themes/epir-online-store/README.md)
- [`workers/dynamic-landing-liquid/README.md`](../workers/dynamic-landing-liquid/README.md)
