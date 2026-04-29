import {useCallback, useEffect, useState} from 'react';
import {
  Links,
  Meta,
  Outlet,
  Scripts,
  ScrollRestoration,
  useLoaderData,
} from '@remix-run/react';
import type {Shop, CountryCode, LanguageCode} from '@shopify/hydrogen/storefront-api-types';
import styles from './styles/app.css';
import tailwind from './styles/tailwind-build.css';
import favicon from '../public/favicon.svg';
import {
  Layout,
  CartHeader,
  CartDrawer,
  ChatWidget,
  ConsentToggle,
  CustomerPrivacyConsentBridge,
  buildConsentPayload,
  getStoredConsent,
  storeConsent,
  getOrCreateAnonymousId,
  getConsentSessionId,
} from '@epir/ui';
import type {PersonaUi} from '@epir/ui';
import {Analytics, Seo, Storefront, getShopAnalytics, useNonce} from '@shopify/hydrogen';
import type {LinksFunction, LoaderFunctionArgs} from '@remix-run/cloudflare';
import {CART_QUERY} from '~/queries/cart';
import {json} from '@remix-run/cloudflare';
import {resolveChatApiUrl} from '~/lib/resolve-chat-api-url';
import {
  KAZKA_CHANNEL,
  KAZKA_CONSENT_ID,
  KAZKA_CONSENT_STORAGE_KEY,
  KAZKA_STOREFRONT_ID,
} from '~/lib/chat-widget-context';
import {loadKazkaPersonaUi} from '~/lib/persona-ui.server';

function privacyPolicyUrlFromShop(domain: string | undefined): string | undefined {
  if (!domain?.trim()) return undefined;
  const host = domain.replace(/^https?:\/\//, '').replace(/\/$/, '');
  return `https://${host}/policies/privacy-policy`;
}

export const links: LinksFunction = () => {
  return [
    {rel: 'stylesheet', href: tailwind},
    {rel: 'stylesheet', href: styles},
    {
      rel: 'preconnect',
      href: 'https://cdn.shopify.com',
    },
    {
      rel: 'preconnect',
      href: 'https://shop.app',
    },
    {rel: 'icon', type: 'image/svg+xml', href: favicon},
  ];
};

export async function loader({context, request}: LoaderFunctionArgs) {
  const cartId = await context.session.get('cartId');
  const configuredChatApiUrl = context.env.CHAT_API_URL as string | undefined;
  const chatApiUrl = resolveChatApiUrl(configuredChatApiUrl);
  const brand = (context.env.BRAND as string) || 'epir';
  const filter = context.env.COLLECTION_FILTER;
  const allowedHandles = filter
    ? filter.split(',').map((h: string) => h.trim()).filter(Boolean)
    : null;
  const route = new URL(request.url).pathname;

  const [layout, collectionsResult, personaUi] = await Promise.all([
    context.storefront.query<{shop: Shop}>(LAYOUT_QUERY),
    context.storefront.query<{collections: {nodes: {id: string; title: string; handle: string}[]}}>(
      COLLECTIONS_QUERY,
    ),
    loadKazkaPersonaUi(context.env),
  ]);

  const nodes = allowedHandles?.length
    ? collectionsResult.collections.nodes.filter((c: {handle: string}) =>
        allowedHandles.includes(c.handle),
      )
    : collectionsResult.collections.nodes;

  const checkoutDomain = (context.env.PUBLIC_CHECKOUT_DOMAIN ?? '').trim();
  if (!checkoutDomain) {
    // eslint-disable-next-line no-console
    console.warn(
      '[kazka] PUBLIC_CHECKOUT_DOMAIN nie jest ustawione — Hydrogen Analytics i Customer Privacy mogą nie działać.',
    );
  }

  const shopAnalytics = await getShopAnalytics({
    storefront: context.storefront,
    publicStorefrontId: context.env.PUBLIC_STOREFRONT_ID,
  });

  /** Headless storefront na innym hoście niż myshopify — bez proxy SFAPI w tej samej origin ustawiamy explicit false (Hydrogen). */
  const sameDomainForStorefrontApi = false;

  const analyticsConsent = {
    checkoutDomain,
    storefrontAccessToken: context.env.PUBLIC_STOREFRONT_API_TOKEN,
    country: context.storefront.i18n.country,
    language: context.storefront.i18n.language,
    sameDomainForStorefrontApi,
  };

  const cart = cartId ? await getCart(context.storefront, cartId) : null;

  return json({
    layout,
    cart,
    collections: {nodes},
    selectedLocale: {
      country: context.storefront.i18n.country,
      language: context.storefront.i18n.language,
    },
    privacyPolicyUrl: privacyPolicyUrlFromShop(context.env.PUBLIC_STORE_DOMAIN),
    chatApiUrl,
    cartId,
    brand,
    personaUi,
    storefrontId: KAZKA_STOREFRONT_ID,
    channel: KAZKA_CHANNEL,
    route,
    shopDomain: new URL(request.url).host,
    shopAnalytics,
    analyticsConsent,
  });
}

async function getCart(storefront: Storefront, cartId: string) {
  if (!storefront) {
    throw new Error('missing storefront client in cart query');
  }

  const {cart} = await storefront.query(CART_QUERY, {
    variables: {
      cartId,
      country: storefront.i18n.country,
      language: storefront.i18n.language,
    },
    cache: storefront.CacheNone(),
  });

  return cart;
}

function KazkaConsentAndChat({
  chatApiUrl,
  cartId,
  brand,
  personaUi,
  storefrontId,
  channel,
  route,
  shopDomain,
  analyticsConsent,
  privacyPolicyUrl,
}: {
  chatApiUrl: string;
  cartId?: string | null;
  brand: string;
  personaUi: PersonaUi;
  storefrontId: string;
  channel: string;
  route?: string;
  shopDomain: string;
  privacyPolicyUrl?: string;
  analyticsConsent: {
    checkoutDomain: string;
    storefrontAccessToken: string;
    country: CountryCode;
    language: LanguageCode;
    sameDomainForStorefrontApi: boolean;
  };
}) {
  const [consentGranted, setConsentGranted] = useState(false);
  const [pendingConsent, setPendingConsent] = useState(false);
  const [consentError, setConsentError] = useState<string | null>(null);

  useEffect(() => {
    if (getStoredConsent(KAZKA_CONSENT_STORAGE_KEY) === true) {
      setConsentGranted(true);
    }
  }, []);

  const onConsentChange = useCallback(
    async (next: boolean) => {
      setConsentError(null);
      if (!next) {
        storeConsent(false, KAZKA_CONSENT_STORAGE_KEY);
        setConsentGranted(false);
        return;
      }
      setPendingConsent(true);
      try {
        const sessionId = getConsentSessionId() || getOrCreateAnonymousId();
        const payload = buildConsentPayload({
          consentId: KAZKA_CONSENT_ID,
          granted: true,
          source: 'hydrogen-kazka',
          storefrontId,
          channel,
          shopDomain,
          route: route ?? '/',
          sessionId,
          anonymousId: getOrCreateAnonymousId(),
          customerId: null,
        });
        const res = await fetch('/api/consent', {
          method: 'POST',
          headers: {'Content-Type': 'application/json'},
          body: JSON.stringify(payload),
        });
        if (!res.ok) {
          const errText = await res.text().catch(() => '');
          let message = errText || `HTTP ${res.status}`;
          try {
            const j = JSON.parse(errText) as {error?: unknown};
            if (typeof j.error === 'string' && j.error.trim()) {
              message = j.error;
            }
          } catch {
            /* response nie-JSON */
          }
          throw new Error(message);
        }
        storeConsent(true, KAZKA_CONSENT_STORAGE_KEY);
        setConsentGranted(true);
      } catch (e) {
        setConsentError(
          e instanceof Error ? e.message : 'Nie udało się zapisać zgody.',
        );
        setConsentGranted(false);
      } finally {
        setPendingConsent(false);
      }
    },
    [channel, route, shopDomain, storefrontId],
  );

  const showConsentCard =
    !consentGranted || pendingConsent || consentError !== null;
  const showRevokeOnly =
    consentGranted && !pendingConsent && consentError === null;

  return (
    <>
      {showConsentCard ? (
        <div className="fixed bottom-4 left-4 z-50 max-w-sm rounded-lg border border-gray-200 bg-white p-3 shadow-md">
          <ConsentToggle
            checked={consentGranted}
            onChange={(c) => void onConsentChange(c)}
            disabled={pendingConsent}
            label="Zgoda na czat i pliki cookie: klikając „Zgadzam się”, akceptujesz pliki cookie i podobne technologie do działania czatu AI oraz podstawowej analityki i dopasowania treści (Kazka)."
          />
          {privacyPolicyUrl ? (
            <p className="mt-2 text-xs">
              <a
                href={privacyPolicyUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="text-blue-800 underline hover:text-blue-900"
              >
                Polityka prywatności
              </a>
            </p>
          ) : null}
          {consentError ? (
            <p className="mt-2 text-xs text-red-600">{consentError}</p>
          ) : null}
        </div>
      ) : null}
      {showRevokeOnly ? (
        <div className="fixed bottom-4 left-4 z-50 rounded-md border border-gray-200 bg-white/95 px-3 py-2 shadow-sm">
          <button
            type="button"
            className="text-xs text-gray-700 underline hover:text-gray-900"
            onClick={() => void onConsentChange(false)}
          >
            Cofnij zgodę
          </button>
        </div>
      ) : null}
      {analyticsConsent.checkoutDomain ? (
        <CustomerPrivacyConsentBridge
          checkoutDomain={analyticsConsent.checkoutDomain}
          storefrontAccessToken={analyticsConsent.storefrontAccessToken}
          country={analyticsConsent.country}
          locale={analyticsConsent.language}
          sameDomainForStorefrontApi={analyticsConsent.sameDomainForStorefrontApi}
          consentGranted={consentGranted}
        />
      ) : null}
      <ChatWidget
        chatApiUrl={chatApiUrl}
        cartId={cartId}
        brand={brand}
        personaUi={personaUi}
        storefrontId={storefrontId}
        channel={channel}
        route={route}
        consentGranted={consentGranted}
      />
    </>
  );
}

export default function App() {
  const nonce = useNonce();
  const data = useLoaderData<typeof loader>();
  const shopAnalytics = data.shopAnalytics;
  const canHydrogenAnalytics =
    Boolean(data.analyticsConsent.checkoutDomain) && shopAnalytics != null;

  const shell = (
    <>
      <Layout
        title={data.layout.shop.name}
        collections={data.collections?.nodes ?? []}
        cart={data.cart}
        renderCartHeader={({cart, openDrawer}) =>
          cart ? <CartHeader cart={cart} openDrawer={openDrawer} /> : null
        }
        renderCartDrawer={({cart, close}) =>
          cart ? <CartDrawer cart={cart} close={close} /> : null
        }
      >
        <Outlet />
      </Layout>
      <KazkaConsentAndChat
        chatApiUrl={data.chatApiUrl}
        cartId={data.cartId}
        brand={data.brand}
        personaUi={data.personaUi}
        storefrontId={data.storefrontId}
        channel={data.channel}
        route={data.route}
        shopDomain={data.shopDomain}
        privacyPolicyUrl={data.privacyPolicyUrl}
        analyticsConsent={data.analyticsConsent}
      />
    </>
  );

  return (
    <html lang="pl">
      <head>
        <meta charSet="utf-8" />
        <meta name="viewport" content="width=device-width,initial-scale=1" />
        <Seo />
        <Meta />
        <Links />
      </head>
      <body>
        {/*
          Banner cookie Shopify (Admin → Customer Privacy): celowo wyłączony (`withPrivacyBanner: false`).
          Iteracja 1: ConsentToggle przy czacie + CustomerPrivacyConsentBridge.
          Iteracja 2: `withPrivacyBanner: true` dopiero po uporządkowaniu jednego UI zgód.
        */}
        {canHydrogenAnalytics ? (
          <Analytics.Provider
            cart={data.cart ?? null}
            shop={shopAnalytics}
            consent={{
              checkoutDomain: data.analyticsConsent.checkoutDomain,
              storefrontAccessToken: data.analyticsConsent.storefrontAccessToken,
              withPrivacyBanner: false,
              country: data.analyticsConsent.country,
              language: data.analyticsConsent.language,
              sameDomainForStorefrontApi: data.analyticsConsent.sameDomainForStorefrontApi,
            }}
            customData={{
              channel: data.channel,
              storefrontId: data.storefrontId,
            }}
          >
            {shell}
          </Analytics.Provider>
        ) : (
          shell
        )}
        <ScrollRestoration nonce={nonce} />
        <Scripts nonce={nonce} />
      </body>
    </html>
  );
}

const LAYOUT_QUERY = `#graphql
  query layout {
    shop {
      name
      description
    }
  }
`;

const COLLECTIONS_QUERY = `#graphql
  query LayoutCollections {
    collections(first: 20, query: "collection_type:smart") {
      nodes {
        id
        title
        handle
      }
    }
  }
`;
