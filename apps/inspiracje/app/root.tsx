import {
  Links,
  Meta,
  Outlet,
  Scripts,
  ScrollRestoration,
  useLoaderData,
} from '@remix-run/react';
import styles from './styles/app.css';
import tailwind from './styles/tailwind-build.css';
import favicon from '../public/favicon.svg';
import type {LinksFunction, LoaderFunctionArgs} from '@remix-run/cloudflare';
import {json} from '@remix-run/cloudflare';
import {Footer} from '~/components/Footer';
import {Header} from '~/components/Header';
import {
  DEFAULT_CTA_LABEL,
  getArchiveSnapshot,
  resolveCtaUrl,
  resolveMainShopUrl,
} from '~/lib/archive';

export const links: LinksFunction = () => {
  return [
    {rel: 'stylesheet', href: tailwind},
    {rel: 'stylesheet', href: styles},
    {rel: 'preconnect', href: 'https://cdn.shopify.com'},
    {rel: 'preconnect', href: 'https://fonts.googleapis.com'},
    {
      rel: 'preconnect',
      href: 'https://fonts.gstatic.com',
      crossOrigin: 'anonymous',
    },
    {
      rel: 'stylesheet',
      href: 'https://fonts.googleapis.com/css2?family=Cormorant+Garamond:wght@400;500;600;700&display=swap',
    },
    {rel: 'icon', type: 'image/svg+xml', href: favicon},
  ];
};

export async function loader({context}: LoaderFunctionArgs) {
  const archive = getArchiveSnapshot();
  return json({
    brand: (context.env.BRAND as string) || 'inspiracje',
    ctaUrl: resolveCtaUrl(context.env.PUBLIC_CTA_URL),
    ctaLabel: archive.ctaLabel || DEFAULT_CTA_LABEL,
    mainShopUrl: resolveMainShopUrl(context.env.PUBLIC_MAIN_SHOP_URL),
    publicStorefrontUrl:
      context.env.PUBLIC_STOREFRONT_URL || 'https://inspiracje.epirbizuteria.pl',
  });
}

export default function App() {
  const data = useLoaderData<typeof loader>();

  return (
    <html lang="pl">
      <head>
        <meta charSet="utf-8" />
        <meta name="viewport" content="width=device-width,initial-scale=1" />
        <Meta />
        <Links />
      </head>
      <body className="min-h-screen antialiased">
        <div className="flex min-h-screen flex-col">
          <Header
            mainShopUrl={data.mainShopUrl}
            ctaUrl={data.ctaUrl}
            ctaLabel={data.ctaLabel}
          />
          <main className="flex-1">
            <Outlet />
          </main>
          <Footer ctaUrl={data.ctaUrl} />
        </div>
        <ScrollRestoration />
        <Scripts />
      </body>
    </html>
  );
}
