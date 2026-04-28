---
name: Hydrogen Analytics + Customer Privacy
overview: Konfiguracja Analytics.Provider i Customer Privacy API pod aplikację „Google & YouTube” (bez gtag/GTM w Hydrogen), z mapowaniem na strukturę Remix/EPIR i konfliktami z istniejącą zgodą czatu.
todos:
  - id: ctx-cart
    content: Rozszerzyć load context (server) o cart handler Hydrogen i pola env (PUBLIC_CHECKOUT_DOMAIN itd.).
  - id: root-provider
    content: Owinąć Outlet w Analytics.Provider + serwerowy loader z cart/shop/consent/customData.
  - id: route-analytics
    content: Dodać komponenty Analytics.* na trasach (page/product/collection/cart zgodnie z dokumentacją).
  - id: csp-proxy
    content: Zweryfikować CSP (createContentSecurityPolicy) i proxy Storefront API dla consent cookies (wg Shopify consent docs).
  - id: consent-ux
    content: Ustalić strategię wobec istniejącego ConsentToggle/czatu vs natywny banner Shopify (withPrivacyBanner).
---

# Hydrogen Analytics + Customer Privacy → Shopify → „Google & YouTube”

## Cel

- **W Hydrogen:** `Analytics.Provider` (`Analytics` z `@shopify/hydrogen`) zasilany z loadera (`cart`, `shop` z `getShopAnalytics`, `consent` z Customer Privacy), **bez** `gtag`, `window.dataLayer`, GTM.
- **Po stronie Shopify:** aplikacja [Google & YouTube](https://apps.shopify.com/) korzysta z danych już zbieranych przez Shopify — Hydrogen ma poprawnie publikować eventy do Shopify Analytics przy zgodach z Customer Privacy API.

## Oficjalny kontrakt API (źródło prawdy)

[Analytics.Provider – props](https://shopify.dev/docs/api/hydrogen/current/components/analytics/analytics-provider):

| Prop | Źródło |
|------|--------|
| `cart` | **Wymagane.** Promise lub cart — np. `context.cart.get()` |
| `shop` | **Wymagane.** `getShopAnalytics({ storefront, publicStorefrontId: env.PUBLIC_STOREFRONT_ID })` (TS w dokumentacji) lub uproszczony wariant z kontekstu Hydrogen |
| `consent` | **Wymagane.** `checkoutDomain`, `storefrontAccessToken`, opcjonalnie `country`, `language`, `withPrivacyBanner`, `sameDomainForStorefrontApi` |
| `customData` | Opcjonalnie — np. locale, kanał storefrontu |
| `canTrack` | Opcjonalnie — domyślnie oparte na Customer Privacy (`analyticsProcessingAllowed()`) |

[Consent – checklist Shopify](https://shopify.dev/docs/storefronts/headless/hydrogen/analytics/consent): `PUBLIC_CHECKOUT_DOMAIN` (bez `https://`), CSP z `shop.checkoutDomain` + `storeDomain`, banner w Admin (**Settings → Customer Privacy → Cookie banner**), opcjonalnie proxy Storefront API pod tę samą origin (Hydrogen domyślnie przy standardowym handlerze).

[`useCustomerPrivacy`](https://shopify.dev/docs/storefronts/headless/hydrogen/privacy/customer-privacy-api): jeśli potrzebujesz odczytu stanu w komponentach (banner Shopify nadal steruje `window.Shopify.customerPrivacy`).

## Przykładowa struktura plików (wzór doc vs EPIR)

Doc (React Router 7) używa `react-router`; w EPIR zamień na `@remix-run/react` / `@remix-run/cloudflare`.

```
app/
  root.tsx              ← loader zwraca cart, shop, consent; default eksport owija <Outlet /> w <Analytics.Provider>
  entry.server.tsx      ← opcjonalnie createContentSecurityPolicy z PUBLIC_CHECKOUT_DOMAIN + PUBLIC_STORE_DOMAIN
server.ts               ← getLoadContext: storefront + session + cart handler Hydrogen (createCartHandler / hydrogen context)
```

### Loader (logika — pseudokod zgodny z dokumentacją Shopify)

```tsx
// Importy — Remix zamiast react-router:
import type {LoaderFunctionArgs} from '@remix-run/cloudflare';
import {Analytics, getShopAnalytics} from '@shopify/hydrogen';

export async function loader({context}: LoaderFunctionArgs) {
  const {cart, storefront, env} = context as AppLoadContext;
  // cart musi pochodzić z kontekstu Hydrogen (handler koszyka)
  const cartPromise = cart.get();

  return {
    cart: cartPromise,
    shop: getShopAnalytics({
      storefront,
      publicStorefrontId: env.PUBLIC_STOREFRONT_ID,
    }),
    consent: {
      checkoutDomain: env.PUBLIC_CHECKOUT_DOMAIN,
      storefrontAccessToken: env.PUBLIC_STOREFRONT_API_TOKEN,
      withPrivacyBanner: true,
      country: storefront.i18n.country,
      language: storefront.i18n.language,
    },
    customData: {
      // np. channel: 'hydrogen-zareczyny', locale: storefront.i18n.language
    },
  };
}
```

### Root — tylko Analytics.Provider, bez skryptów Google

```tsx
import {Outlet, useLoaderData} from '@remix-run/react';
import {Analytics} from '@shopify/hydrogen';

export default function App() {
  const data = useLoaderData<typeof loader>();

  return (
    <Analytics.Provider
      cart={data.cart}
      shop={data.shop}
      consent={data.consent}
      customData={data.customData}
    >
      {/* reszta layoutu: Layout, ChatWidget itd. */}
      <Outlet />
    </Analytics.Provider>
  );
}
```

**Ważne:** Nie wstawiaj żadnych tagów Google w `<head>` ani `<body>` — zgodnie z Twoją architekturą.

### Eventy na trasach (Shopify Analytics)

Z dokumentacji [tracking](https://shopify.dev/docs/storefronts/headless/hydrogen/analytics/tracking):

- Strona główna / ogólny layout: odpowiednie komponenty `Analytics.*` dla page view (wg szablonu Hydrogen dla danej trasy).
- Produkt: `Analytics.ProductView`
- Kolekcja: `Analytics.CollectionView`
- Koszyk: `Analytics.CartView`
- Wyszukiwanie: `Analytics.SearchView` (jeśli masz route search)

**Purchase / checkout:** realizacja zakupu poza Hydrogen (checkout Shopify) — konwersje końcowe są często widoczane po stronie Shopify + pixeli; Hydrogen dostarcza ścieżkę cart/product/page view zgodnie z consent. Jeśli masz stronę „thank you” w headless, sprawdź aktualny wzorzec Hydrogen dla completion (ew. tylko przez Shopify).

## Co trzeba dopisać w repozytorium EPIR (stan wyjściowy)

Obecnie ([`apps/zareczyny/server.ts`](apps/zareczyny/server.ts), [`packages/utils/src/hydrogen.ts`](packages/utils/src/hydrogen.ts)):

- Kontekst ma `storefront`, `session`, `env` — **brak `cart` z Hydrogen Cart API handler**.
- Root loader pobiera koszyk ręcznie (`getCart(storefront, cartId)`), nie przez `context.cart.get()`.

**Krok integracji:** dodać do `getLoadContext` standardowy **cart handler** z pakietu Hydrogen (zgodnie z aktualnym scaffoldem `shopify hydrogen init` / dokumentacja dla Remix/Oxygen), tak aby `loader` root mógł zwracać `cart: cart.get()` jak w dokumentacji. To jest warunek sensownego działania `cart_updated` i powiązanych eventów w `Analytics.Provider`.

Env już przewiduje ([`apps/zareczyny/.dev.vars.example`](apps/zareczyny/.dev.vars.example)): `PUBLIC_CHECKOUT_DOMAIN`, `PUBLIC_STOREFRONT_ID`, tokeny — dopasuj wartości produkcyjne i Pages Secrets.

## CSP i cookies zgody

- Włącz `createContentSecurityPolicy` z `shop: { checkoutDomain, storeDomain }` w [`entry.server.tsx`](apps/zareczyny/app/entry.server.tsx), jeśli jeszcze tego nie ma (Hydrogen consent docs).
- Upewnij się, że **Storefront API** jest dostępny z tej samej origin co storefront (proxy), żeby ciasteczka consent działały — przy custom serverze może być konieczna konfiguracja zgodna z [Consent tracking](https://shopify.dev/docs/storefronts/headless/hydrogen/analytics/consent).

## Ryzyko UX: dwa systemy zgód

W [`apps/zareczyny/app/root.tsx`](apps/zareczyny/app/root.tsx) jest **osobny** flow zgody pod czat (`ConsentToggle`, `/api/consent`, localStorage). Natywny banner Shopify (`withPrivacyBanner: true`) to **drugi** mechanizm.

- **Decyzja produktowa (wymagana):** scentralizować zgodę (np. tylko Customer Privacy + ewentualnie nasłuch `onVisitorConsentCollected` do blokady czatu), albo tymczasowo wyłączyć jeden z bannerów, żeby nie dublować komunikatów.

- Samo `Analytics.Provider` **nie zastępuje** logiki czatu — trzeba jawnie powiązać `consentGranted` czatu ze stanem privacy lub odwrotnie.

## Podsumowanie dla aplikacji „Google & YouTube”

1. Hydrogen wysyła standardowe eventy do **Shopify Analytics** przez `Analytics.Provider` przy poprawnym `consent`.
2. Nie dodajesz warstwy Google w storefrontcie.
3. Aplikacja Google & YouTube w Admin korzysta z ekosystemu Shopify — **nie gwarantujemy automatycznie** mapowania każdego custom pola Hydrogen na kampanie Google bez konfiguracji w tej aplikacji; technicznie krytyczne jest **spójne ID sklepu, kanał Hydrogen i zgodne eventy Shopify**.

## Mapowanie stacku (README dla implementacji)

| Twój opis | EPIR dziś |
|-----------|-----------|
| React Router 7 | Remix 2 (`@remix-run/*`) — te same wzorce loader/root, inne importy |
| `createStorefrontClient` | Już przez [`getStoreFrontClient`](packages/utils/src/hydrogen.ts) |
| `createCartHandler` | Do dodania w server load context |
| `Analytics.Provider` | Brak — do dodania w root |

Po akceptacji planu implementacja obejmuje oba storefronty (`apps/zareczyny`, `apps/kazka`) dla spójności, chyba że scope jest jednym env.
