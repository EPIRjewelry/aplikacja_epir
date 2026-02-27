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
import {Layout, CartHeader, CartDrawer} from '@epir/ui';
import {ChatWidget} from '~/components/ChatWidget';
import {Seo, Storefront} from '@shopify/hydrogen';
import type {LinksFunction, LoaderArgs} from '@remix-run/cloudflare';
import {CART_QUERY} from '~/queries/cart';
import {defer} from '@remix-run/cloudflare';

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

const DEFAULT_CHAT_API_URL = 'https://asystent.epirbizuteria.pl/chat';

export async function loader({context, request}: LoaderArgs) {
  const cartId = await context.session.get('cartId');
  const chatApiUrl =
    (context.env.CHAT_API_URL as string | undefined) || DEFAULT_CHAT_API_URL;
  const brand = (context.env.BRAND as string) || 'epir';
  const filter = context.env.COLLECTION_FILTER;
  const allowedHandles = filter
    ? filter.split(',').map((h: string) => h.trim()).filter(Boolean)
    : null;

  const [layout, collectionsResult] = await Promise.all([
    context.storefront.query<{shop: Shop}>(LAYOUT_QUERY),
    context.storefront.query<{collections: {nodes: {id: string; title: string; handle: string}[]}}>(
      COLLECTIONS_QUERY,
    ),
  ]);

  const nodes = allowedHandles?.length
    ? collectionsResult.collections.nodes.filter((c: {handle: string}) =>
        allowedHandles.includes(c.handle),
      )
    : collectionsResult.collections.nodes;

  return defer({
    layout,
    cart: cartId ? getCart(context.storefront, cartId) : undefined,
    collections: {nodes},
    chatApiUrl,
    cartId,
    brand,
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

export default function App() {
  const data = useLoaderData<typeof loader>();

  return (
    <html lang="pl">
      <head>
        {/* TODO: If chat runs on separate Worker, add its domain to CSP via createContentSecurityPolicy from @shopify/hydrogen */}
        <meta charSet="utf-8" />
        <meta name="viewport" content="width=device-width,initial-scale=1" />
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
        <ChatWidget
          chatApiUrl={data.chatApiUrl}
          cartId={data.cartId}
          brand={data.brand}
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
