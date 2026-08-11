import {
  hasUtmParams,
  loadCampaignByHandle,
  loadCampaignMapping,
  resolveCampaignHandleFromUrl,
} from './campaign';
import type {Env} from './env';
import {
  hasPreviewAuthAttempt,
  isLandingPreviewRequest,
  matchedPreviewSecret,
  previewAuthConfiguredCount,
  previewCleanUrl,
  shouldRenderLandings,
  withPreviewSession,
} from './landing-preview';
import {applyCampaignRewriter} from './html-rewriter';
import {shouldTransformRequest} from './paths';
import {
  isAdsLandingHost,
  loadCampaignProducts,
  renderStandaloneLandingHtml,
} from './render-landing';

export {hasUtmParams, resolveCampaignHandleFromUrl, parseCampaignMapping, parseProductIdsField} from './campaign';
export {shouldTransformPath, shouldTransformRequest} from './paths';

const CACHE_CONTROL = 'public, max-age=60, stale-while-revalidate=600';

function isHtmlResponse(response: Response): boolean {
  const contentType = response.headers.get('Content-Type') ?? '';
  return contentType.toLowerCase().includes('text/html');
}

function withCacheHeaders(
  response: Response,
  extras?: Record<string, string>,
): Response {
  const headers = new Headers(response.headers);
  if (extras?.['Cache-Control']) {
    headers.set('Cache-Control', extras['Cache-Control']);
  } else {
    headers.set('Cache-Control', CACHE_CONTROL);
  }
  if (extras) {
    for (const [k, v] of Object.entries(extras)) headers.set(k, v);
  }
  const vary = headers.get('Vary');
  if (vary) {
    if (!/\bAccept-Encoding\b/i.test(vary)) {
      headers.set('Vary', `${vary}, Accept-Encoding`);
    }
  } else {
    headers.set('Vary', 'Accept-Encoding');
  }
  return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers,
  });
}

export function buildOriginRequest(
  request: Request,
  env: Env,
): Request {
  const originHost =
    env.SHOPIFY_PUBLIC_DOMAIN?.trim() || env.SHOPIFY_STOREFRONT_DOMAIN?.trim();
  const url = new URL(request.url);
  if (originHost) {
    url.hostname = originHost;
    url.protocol = 'https:';
    url.port = '';
  }

  const headers = new Headers(request.headers);
  headers.delete('host');
  if (originHost) headers.set('Host', originHost);

  return new Request(url.toString(), {
    method: request.method,
    headers,
    body: request.method === 'GET' || request.method === 'HEAD' ? undefined : request.body,
    redirect: 'manual',
  });
}

async function fetchOriginPassthrough(
  request: Request,
  env: Env,
): Promise<Response> {
  const publicHost = env.SHOPIFY_PUBLIC_DOMAIN?.trim() || 'epirbizuteria.pl';
  const shopifyIpv4 = (env.SHOPIFY_ORIGIN_IPV4 ?? '23.227.38.65').trim();
  const url = new URL(request.url);
  const originUrl = `https://${shopifyIpv4}${url.pathname}${url.search}`;
  const headers = new Headers(request.headers);
  headers.delete('host');
  headers.set('Host', publicHost);
  headers.set('X-Forwarded-Host', publicHost);
  headers.set('X-Forwarded-Proto', 'https');

  return fetch(originUrl, {
    method: request.method,
    headers,
    body: request.method === 'GET' || request.method === 'HEAD' ? undefined : request.body,
    redirect: 'manual',
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    cf: {resolveOverride: shopifyIpv4} as any,
  } as RequestInit);
}

async function renderStandaloneLanding(
  request: Request,
  env: Env,
  handle: string,
  opts?: {preview?: boolean},
): Promise<Response | null> {
  const campaign = await loadCampaignByHandle(env, handle);
  if (!campaign?.heroTitle) return null;
  const products = await loadCampaignProducts(env, campaign.productIds);
  const html = renderStandaloneLandingHtml(env, campaign, products);
  const extras: Record<string, string> = {
    'X-EPIR-Campaign-Handle': handle,
    'X-EPIR-Landing-Mode': 'standalone',
  };
  if (opts?.preview) {
    extras['X-EPIR-Landing-Preview'] = 'true';
    extras['Cache-Control'] = 'no-store';
  }
  return withCacheHeaders(
    new Response(html, {
      status: 200,
      headers: {'Content-Type': 'text/html; charset=utf-8'},
    }),
    extras,
  );
}

export function landingsEnabled(env: Env): boolean {
  return (env.LANDINGS_ENABLED ?? 'false').trim().toLowerCase() === 'true';
}

function storeHost(env: Env): string {
  return env.SHOPIFY_PUBLIC_DOMAIN?.trim() || 'epirbizuteria.pl';
}

function previewDebugHeaders(
  request: Request,
  env: Env,
): Record<string, string> {
  if (!hasPreviewAuthAttempt(request)) return {};
  return {
    'X-EPIR-Preview-Support': '1',
    'X-EPIR-Preview-Secrets': String(previewAuthConfiguredCount(env)),
    'X-EPIR-Preview-Matched': String(isLandingPreviewRequest(request, env)),
  };
}

/** When landings are off: send traffic to a product page, never home or landing HTML. */
async function redirectAdsHostWhenLandingsDisabled(
  request: Request,
  env: Env,
  url: URL,
): Promise<Response> {
  const store = storeHost(env);
  const debug = previewDebugHeaders(request, env);
  if (url.pathname.startsWith('/products/')) {
    return Response.redirect(`https://${store}${url.pathname}${url.search}`, 302);
  }
  try {
    const mapping = await loadCampaignMapping(env);
    const handle = resolveCampaignHandleFromUrl(url, mapping, {allowDefault: false});
    if (handle) {
      const campaign = await loadCampaignByHandle(env, handle);
      const products = await loadCampaignProducts(env, campaign?.productIds ?? []);
      const first = products.find((p) => p.handle?.trim());
      if (first?.handle) {
        return new Response(null, {
          status: 302,
          headers: {
            Location: `https://${store}/products/${first.handle}${url.search}`,
            'X-EPIR-Landings-Enabled': 'false',
            'X-EPIR-Landing-Redirect': 'product',
            'Cache-Control': 'no-store',
            ...debug,
          },
        });
      }
    }
  } catch {
    // fall through to 410
  }
  return new Response('Campaign landings are temporarily disabled', {
    status: 410,
    headers: {
      'Content-Type': 'text/plain; charset=utf-8',
      'Cache-Control': 'no-store',
      'X-EPIR-Landings-Enabled': 'false',
      ...debug,
    },
  });
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);
    const adsHost = isAdsLandingHost(url.hostname, env);
    const landingsOn = shouldRenderLandings(request, env);
    const previewSecret = matchedPreviewSecret(request, env);
    const preview = previewSecret !== null;

    // Ads landing host: standalone HTML from Storefront (Liquid proxy blocked by CF↔Shopify).
    if (adsHost) {
      if (request.method !== 'GET' && request.method !== 'HEAD') {
        return new Response('Method Not Allowed', {status: 405});
      }

      const cleanUrl = previewCleanUrl(request);
      if (cleanUrl && previewSecret) {
        return withPreviewSession(
          new Response(null, {
            status: 302,
            headers: {
              Location: cleanUrl,
              'Cache-Control': 'no-store',
              'X-EPIR-Landing-Preview': 'true',
              'X-EPIR-Preview-Session': 'established',
            },
          }),
          previewSecret,
        );
      }

      if (!landingsOn) {
        return redirectAdsHostWhenLandingsDisabled(request, env, url);
      }
      if (url.pathname !== '/' && url.pathname !== '') {
        const store = storeHost(env);
        return Response.redirect(`https://${store}${url.pathname}${url.search}`, 302);
      }
      try {
        const mapping = await loadCampaignMapping(env);
        const handle =
          resolveCampaignHandleFromUrl(url, mapping, {allowDefault: false}) ||
          mapping.forest_premium ||
          mapping.organic_art ||
          mapping.default;
        if (!handle) {
          return Response.redirect(`https://${storeHost(env)}/`, 302);
        }
        const rendered = await renderStandaloneLanding(request, env, handle, {
          preview,
        });
        if (rendered) return withPreviewSession(rendered, previewSecret);
        return Response.redirect(`https://${storeHost(env)}/`, 302);
      } catch {
        return Response.redirect(`https://${storeHost(env)}/`, 302);
      }
    }

    if (!shouldTransformRequest(request, url)) {
      return fetchOriginPassthrough(request, env);
    }

    if (!hasUtmParams(url)) {
      return fetchOriginPassthrough(request, env);
    }

    if (!landingsOn) {
      return fetchOriginPassthrough(request, env);
    }

    try {
      const mapping = await loadCampaignMapping(env);
      const handle = resolveCampaignHandleFromUrl(url, mapping, {
        allowDefault: false,
      });
      if (!handle) {
        return fetchOriginPassthrough(request, env);
      }

      const campaign = await loadCampaignByHandle(env, handle);
      if (!campaign?.heroTitle) {
        return fetchOriginPassthrough(request, env);
      }

      const originResponse = await fetchOriginPassthrough(request, env);
      if (!isHtmlResponse(originResponse) || originResponse.status >= 500) {
        const standalone = await renderStandaloneLanding(request, env, handle);
        if (standalone) return standalone;
        return originResponse;
      }

      const rewritten = applyCampaignRewriter(originResponse, campaign);
      return withCacheHeaders(rewritten, {
        'X-EPIR-Campaign-Handle': handle,
        'X-EPIR-Landing-Mode': 'rewriter',
      });
    } catch {
      return fetchOriginPassthrough(request, env);
    }
  },
};
