import {RemixServer} from '@remix-run/react';
import isbot from 'isbot';
import {renderToReadableStream} from 'react-dom/server';
import {EntryContext} from '@remix-run/cloudflare';
import {createContentSecurityPolicy} from '@shopify/hydrogen';

/**
 * Domenery dla CSP (`connect-src`). `connect-src` dla myshopify pozwala CDN / innym zasobom Shopify;
 * Storefront GraphQL z przeglądarki idzie na same-origin `/api/.../graphql.json` (sameDomainForStorefrontApi).
 */
const SHOP_FOR_CSP = {
  checkoutDomain: 'checkout.shopify.com',
  storeDomain: 'epir-art-silver-jewellery.myshopify.com',
} as const;

export default async function handleRequest(
  request: Request,
  responseStatusCode: number,
  responseHeaders: Headers,
  remixContext: EntryContext,
) {
  const {nonce, header, NonceProvider} = createContentSecurityPolicy({
    shop: SHOP_FOR_CSP,
    mediaSrc: [
      "'self'",
      'https://epirbizuteria.pl',
      'https://cdn.shopify.com',
    ],
    connectSrc: [
      "'self'",
      'https://monorail-edge.shopifysvc.com',
      'https://checkout.shopify.com',
      'https://epir-art-silver-jewellery.myshopify.com',
      'https://cdn.shopify.com',
      'https://shopifycloud.com',
    ],
  });

  const body = await renderToReadableStream(
    <NonceProvider>
      <RemixServer context={remixContext} url={request.url} />
    </NonceProvider>,
    {
      nonce,
      signal: request.signal,
      onError(error) {
        // eslint-disable-next-line no-console
        console.error(error);
        responseStatusCode = 500;
      },
    },
  );

  if (isbot(request.headers.get('user-agent'))) {
    await body.allReady;
  }

  responseHeaders.set('Content-Type', 'text/html');
  responseHeaders.set('Content-Security-Policy', header);
  return new Response(body, {
    headers: responseHeaders,
    status: responseStatusCode,
  });
}
