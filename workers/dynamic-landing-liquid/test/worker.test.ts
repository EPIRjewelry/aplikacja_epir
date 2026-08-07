import {
  createExecutionContext,
  env,
  fetchMock,
  waitOnExecutionContext,
} from 'cloudflare:test';
import {afterAll, afterEach, beforeAll, describe, expect, it} from 'vitest';
import worker from '../src/index';

const ORIGIN_HTML = `<!DOCTYPE html>
<html><body>
  <h1 data-dynamic-hero-title>Default Title</h1>
  <p data-dynamic-hero-subtitle>Default Subtitle</p>
  <div data-dynamic-products>featured</div>
  <a data-dynamic-cta href="/default">Default CTA</a>
</body></html>`;

const MAPPING_BODY = JSON.stringify({
  data: {
    shop: {
      campaignMapping: {
        value: JSON.stringify({
          kazka_b2b: 'b2b-landing',
          default: 'default-landing',
        }),
      },
    },
  },
});

const LANDING_BODY = JSON.stringify({
  data: {
    metaobject: {
      handle: 'b2b-landing',
      heroTitle: {value: 'B2B Hero'},
      heroSubtitle: {value: 'B2B Sub'},
      productIds: {
        value: JSON.stringify([
          'gid://shopify/Product/1',
          'gid://shopify/Product/2',
        ]),
      },
      ctaLabel: {value: 'Shop B2B'},
      ctaUrl: {value: '/collections/b2b'},
    },
  },
});

function shopDomain(): string {
  return (
    (env as {SHOPIFY_PUBLIC_DOMAIN?: string}).SHOPIFY_PUBLIC_DOMAIN ??
    (env as {SHOPIFY_STOREFRONT_DOMAIN: string}).SHOPIFY_STOREFRONT_DOMAIN
  );
}

function storefrontDomain(): string {
  return (env as {SHOPIFY_STOREFRONT_DOMAIN: string}).SHOPIFY_STOREFRONT_DOMAIN;
}

function apiVersion(): string {
  return (
    (env as {SHOPIFY_STOREFRONT_API_VERSION?: string})
      .SHOPIFY_STOREFRONT_API_VERSION ?? '2024-10'
  );
}

function decodeBody(body: unknown): string {
  if (typeof body === 'string') return body;
  if (body instanceof Uint8Array) return new TextDecoder().decode(body);
  if (body && typeof body === 'object' && 'buffer' in (body as object)) {
    return new TextDecoder().decode(body as ArrayBuffer);
  }
  return '';
}

beforeAll(() => {
  fetchMock.activate();
  fetchMock.disableNetConnect();
});

afterEach(() => {
  fetchMock.assertNoPendingInterceptors();
});

afterAll(() => {
  fetchMock.deactivate();
});

function graphqlReply(opts: {body?: unknown}): string {
  const body = decodeBody(opts.body);
  if (body.includes('CampaignMapping')) return MAPPING_BODY;
  if (body.includes('CampaignLanding')) return LANDING_BODY;
  return JSON.stringify({data: null});
}

describe('dynamic-landing-liquid worker', () => {
  it('rewrites hero CTA and product ids for utm_campaign', async () => {
    const origin = `https://${shopDomain()}`;
    const storefront = `https://${storefrontDomain()}`;
    const pool = fetchMock.get(origin);

    fetchMock
      .get(storefront)
      .intercept({path: '/api/' + apiVersion() + '/graphql.json', method: 'POST'})
      .reply(200, graphqlReply, {headers: {'Content-Type': 'application/json'}})
      .times(2);

    pool
      .intercept({path: '/', method: 'GET', query: {utm_campaign: 'kazka_b2b'}})
      .reply(200, ORIGIN_HTML, {
        headers: {'Content-Type': 'text/html; charset=utf-8'},
      });

    const request = new Request(
      'https://epirbizuteria.pl/?utm_campaign=kazka_b2b',
    );
    const ctx = createExecutionContext();
    const response = await worker.fetch(request, env);
    await waitOnExecutionContext(ctx);
    const html = await response.text();

    expect(html).toContain('B2B Hero');
    expect(html).toContain('B2B Sub');
    expect(html).toContain('Shop B2B');
    expect(html).toContain('/collections/b2b');
    expect(html).toContain('data-campaign-product-ids');
    expect(html).toContain('gid://shopify/Product/1');
    expect(response.headers.get('Cache-Control')).toContain('max-age=60');
  });

  it('passes through HTML unchanged without UTM', async () => {
    const origin = `https://${shopDomain()}`;
    fetchMock
      .get(origin)
      .intercept({path: '/', method: 'GET'})
      .reply(200, ORIGIN_HTML, {
        headers: {'Content-Type': 'text/html; charset=utf-8'},
      });

    const request = new Request('https://epirbizuteria.pl/');
    const ctx = createExecutionContext();
    const response = await worker.fetch(request, env);
    await waitOnExecutionContext(ctx);
    const html = await response.text();

    expect(html).toContain('Default Title');
    expect(html).not.toContain('B2B Hero');
    expect(html).not.toContain('data-campaign-product-ids');
  });

  it('passes through /cart without campaign GraphQL', async () => {
    const origin = `https://${shopDomain()}`;
    fetchMock
      .get(origin)
      .intercept({path: '/cart', method: 'GET', query: {utm_campaign: 'kazka_b2b'}})
      .reply(200, ORIGIN_HTML, {headers: {'Content-Type': 'text/html'}});

    const request = new Request(
      'https://epirbizuteria.pl/cart?utm_campaign=kazka_b2b',
    );
    const ctx = createExecutionContext();
    const response = await worker.fetch(request, env);
    await waitOnExecutionContext(ctx);
    const html = await response.text();

    expect(html).toContain('Default Title');
    expect(html).not.toContain('B2B Hero');
  });
});
