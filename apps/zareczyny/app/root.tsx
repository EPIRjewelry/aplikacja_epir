import {useCallback, useEffect, useState} from 'react';
import {
  Links,
  Meta,
  Outlet,
  Scripts,
  ScrollRestoration,
  useLoaderData,
} from '@remix-run/react';
import type {Shop} from '@shopify/hydrogen/storefront-api-types';
import styles from './styles/app.css';
import tailwind from './styles/tailwind-build.css';
import favicon from '../public/favicon.svg';
import {
  Layout,
  CartHeader,
  CartDrawer,
  ChatWidget,
  ConsentToggle,
  buildConsentPayload,
  getStoredConsent,
  storeConsent,
  getOrCreateAnonymousId,
  getConsentSessionId,
} from '@epir/ui';
import type {PersonaUi} from '@epir/ui';
import {Seo, Storefront} from '@shopify/hydrogen';
import type {LinksFunction, LoaderFunctionArgs} from '@remix-run/cloudflare';
import {CART_QUERY} from '~/queries/cart';
import {defer} from '@remix-run/cloudflare';
import {resolveChatApiUrl} from '~/lib/resolve-chat-api-url';
import {
  ZARECZYNY_CHANNEL,
  ZARECZYNY_CONSENT_ID,
  ZARECZYNY_CONSENT_STORAGE_KEY,
  ZARECZYNY_STOREFRONT_ID,
} from '~/lib/chat-widget-context';
import {loadZareczynyPersonaUi} from '~/lib/persona-ui.server';
import {
  filterCollectionsForNav,
  parseCollectionFilter,
} from '~/lib/collection-filters';

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
  const brand = (context.env.BRAND as string) || 'zareczyny';
  const allowedHandles = parseCollectionFilter(context.env.COLLECTION_FILTER);
  const hubHandle = context.env.COLLECTION_HUB_HANDLE;
  const route = new URL(request.url).pathname;

  const [layout, collectionsResult, personaUi] = await Promise.all([
    context.storefront.query<{shop: Shop}>(LAYOUT_QUERY),
    context.storefront.query<{
      collections: {nodes: {id: string; title: string; handle: string}[]};
    }>(COLLECTIONS_QUERY),
    loadZareczynyPersonaUi(context.env),
  ]);

  const nodes = filterCollectionsForNav({
    nodes: collectionsResult.collections.nodes,
    allowedHandles,
    hideHubHandle: hubHandle ?? null,
  });

  return defer({
    layout,
    cart: cartId ? getCart(context.storefront, cartId) : undefined,
    collections: {nodes},
    chatApiUrl,
    cartId,
    brand,
    personaUi,
    storefrontId: ZARECZYNY_STOREFRONT_ID,
    channel: ZARECZYNY_CHANNEL,
    route,
    shopDomain: new URL(request.url).host,
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

function ZareczynyConsentAndChat({
  chatApiUrl,
  cartId,
  brand,
  personaUi,
  storefrontId,
  channel,
  route,
  shopDomain,
}: {
  chatApiUrl: string;
  cartId?: string | null;
  brand: string;
  personaUi: PersonaUi;
  storefrontId: string;
  channel: string;
  route?: string;
  shopDomain: string;
}) {
  const [consentGranted, setConsentGranted] = useState(false);
  const [pendingConsent, setPendingConsent] = useState(false);
  const [consentError, setConsentError] = useState<string | null>(null);

  useEffect(() => {
    if (getStoredConsent(ZARECZYNY_CONSENT_STORAGE_KEY) === true) {
      setConsentGranted(true);
    }
  }, []);

  const onConsentChange = useCallback(
    async (next: boolean) => {
      setConsentError(null);
      if (!next) {
        storeConsent(false, ZARECZYNY_CONSENT_STORAGE_KEY);
        setConsentGranted(false);
        return;
      }
      setPendingConsent(true);
      try {
        const sessionId = getConsentSessionId() || getOrCreateAnonymousId();
        const payload = buildConsentPayload({
          consentId: ZARECZYNY_CONSENT_ID,
          granted: true,
          source: 'hydrogen-zareczyny',
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
        storeConsent(true, ZARECZYNY_CONSENT_STORAGE_KEY);
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

  return (
    <>
      <div className="fixed bottom-4 left-4 z-50 max-w-sm rounded-lg border border-gray-200 bg-white p-3 shadow-md">
        <ConsentToggle
          checked={consentGranted}
          onChange={(c) => void onConsentChange(c)}
          disabled={pendingConsent}
          label="Wyrażam zgodę na rozmowę z asystentem AI (pierścionki zaręczynowe EPIR). Zgoda jest wymagana do wysłania wiadomości w czacie."
        />
        {consentError ? (
          <p className="mt-2 text-xs text-red-600">{consentError}</p>
        ) : null}
      </div>
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
  const data = useLoaderData<typeof loader>();

  return (
    <html lang="pl">
      <head>
        <meta charSet="utf-8" />
        <meta name="viewport" content="width=device-width,initial-scale=1" />
        <script
          type="module"
          src="https://cdn.shopify.com/shopifycloud/polaris.js"
          async
        />
        <Seo />
        <Meta />
        <Links />
      </head>
      <body>
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
        <ZareczynyConsentAndChat
          chatApiUrl={data.chatApiUrl}
          cartId={data.cartId}
          brand={data.brand}
          personaUi={data.personaUi}
          storefrontId={data.storefrontId}
          channel={data.channel}
          route={data.route}
          shopDomain={data.shopDomain}
        />
        <ScrollRestoration />
        <Scripts />
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
