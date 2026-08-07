import {
  hasUtmParams,
  loadCampaignByHandle,
  loadCampaignMapping,
  resolveCampaignHandleFromUrl,
} from './campaign';
import type {Env} from './env';
import {applyCampaignRewriter} from './html-rewriter';
import {shouldTransformRequest} from './paths';

export {hasUtmParams, resolveCampaignHandleFromUrl, parseCampaignMapping, parseProductIdsField} from './campaign';
export {shouldTransformPath, shouldTransformRequest} from './paths';

const CACHE_CONTROL = 'public, max-age=60, stale-while-revalidate=600';

function isHtmlResponse(response: Response): boolean {
  const contentType = response.headers.get('Content-Type') ?? '';
  return contentType.toLowerCase().includes('text/html');
}

export function buildOriginRequest(
  request: Request,
  env: Env,
): Request {
  const originHost =
    env.SHOPIFY_PUBLIC_DOMAIN?.trim() || env.SHOPIFY_STOREFRONT_DOMAIN?.trim();
  const url = new URL(request.url);
  url.hostname = originHost;
  url.protocol = 'https:';
  url.port = '';

  const headers = new Headers(request.headers);
  headers.delete('host');
  headers.set('Host', originHost);

  return new Request(url.toString(), {
    method: request.method,
    headers,
    body: request.method === 'GET' || request.method === 'HEAD' ? undefined : request.body,
    redirect: 'manual',
  });
}

function withCacheHeaders(response: Response): Response {
  const headers = new Headers(response.headers);
  headers.set('Cache-Control', CACHE_CONTROL);
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

async function fetchOriginPassthrough(
  request: Request,
  env: Env,
): Promise<Response> {
  const domain =
    env.SHOPIFY_PUBLIC_DOMAIN?.trim() || env.SHOPIFY_STOREFRONT_DOMAIN?.trim();
  if (!domain) return fetch(request);
  return fetch(buildOriginRequest(request, env));
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);

    if (!shouldTransformRequest(request, url)) {
      return fetchOriginPassthrough(request, env);
    }

    if (!hasUtmParams(url)) {
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
      if (!isHtmlResponse(originResponse)) {
        return originResponse;
      }

      const rewritten = applyCampaignRewriter(originResponse, campaign);
      return withCacheHeaders(rewritten);
    } catch {
      return fetchOriginPassthrough(request, env);
    }
  },
};
