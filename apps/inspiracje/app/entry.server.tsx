import {RemixServer} from '@remix-run/react';
import isbot from 'isbot';
import {renderToReadableStream} from 'react-dom/server';
import {EntryContext} from '@remix-run/cloudflare';
import {createContentSecurityPolicy} from '@shopify/hydrogen';

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
    styleSrc: [
      "'self'",
      "'unsafe-inline'",
      'https://cdn.shopify.com',
      'https://fonts.googleapis.com',
    ],
    fontSrc: ["'self'", 'https://fonts.gstatic.com', 'https://cdn.shopify.com'],
    imgSrc: [
      "'self'",
      'data:',
      'https://cdn.shopify.com',
      'https://epirbizuteria.pl',
    ],
    mediaSrc: [
      "'self'",
      'https://epirbizuteria.pl',
      'https://inspiracje.epirbizuteria.pl',
      'https://cdn.shopify.com',
    ],
    connectSrc: [
      "'self'",
      'https://cdn.shopify.com',
      'https://epirbizuteria.pl',
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
