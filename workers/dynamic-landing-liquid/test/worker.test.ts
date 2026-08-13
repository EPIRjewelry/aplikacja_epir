import {
  createExecutionContext,
  env,
  fetchMock,
  waitOnExecutionContext,
} from 'cloudflare:test';
import {afterAll, afterEach, beforeAll, describe, expect, it} from 'vitest';
import worker from '../src/index';

const MAPPING_BODY = JSON.stringify({
  data: {
    shop: {
      campaignMapping: {
        value: JSON.stringify({
          forest_premium: 'forest-premium-landing',
          organic_art: 'organic-art-landing',
          artisan_gold: 'artisan-gold-landing',
          artisan_rings: 'artisan-rings-landing',
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
      handle: 'forest-premium-landing',
      heroTitle: {value: 'Rzemiosło premium'},
      heroSubtitle: {value: 'Ciemny las'},
      productIds: {
        value: JSON.stringify([
          'gid://shopify/Product/1',
          'gid://shopify/Product/2',
        ]),
      },
      ctaLabel: {value: 'Zobacz kolekcję'},
      ctaUrl: {value: '/collections/bestsellery'},
    },
  },
});

const ORGANIC_LANDING_BODY = JSON.stringify({
  data: {
    metaobject: {
      handle: 'organic-art-landing',
      heroTitle: {value: 'Biżuteria artystyczna'},
      heroSubtitle: {
        value:
          'Ręcznie tworzona biżuteria z polskiej pracowni — forma, materiał, symbolika wieczności.',
      },
      productIds: {
        value: JSON.stringify([
          'gid://shopify/Product/1',
          'gid://shopify/Product/2',
        ]),
      },
      ctaLabel: {value: 'Odkryj kolekcję'},
      ctaUrl: {value: '/collections/kolekcja-galazki'},
    },
  },
});

const GOLD_LANDING_BODY = JSON.stringify({
  data: {
    metaobject: {
      handle: 'artisan-gold-landing',
      heroTitle: {value: 'Biżuteria ze złota'},
      heroSubtitle: {value: 'Złoto z pracowni'},
      productIds: {
        value: JSON.stringify([
          'gid://shopify/Product/1',
          'gid://shopify/Product/2',
        ]),
      },
      ctaLabel: {value: 'Zobacz złoto'},
      ctaUrl: {value: '/collections/bestsellery'},
    },
  },
});

const RINGS_LANDING_BODY = JSON.stringify({
  data: {
    metaobject: {
      handle: 'artisan-rings-landing',
      heroTitle: {value: 'Pierścionki artystyczne'},
      heroSubtitle: {value: 'Srebrne pierścionki'},
      productIds: {
        value: JSON.stringify([
          'gid://shopify/Product/1',
          'gid://shopify/Product/2',
        ]),
      },
      ctaLabel: {value: 'Zobacz pierścionki'},
      ctaUrl: {value: '/collections/pierscionki'},
    },
  },
});

const PRODUCTS_BODY = JSON.stringify({
  data: {
    nodes: [
      {
        id: 'gid://shopify/Product/1',
        title: 'Pierścionek test',
        handle: 'pierscionek-test',
        featuredImage: {
          url: 'https://cdn.shopify.com/s/files/1/0000/0001/files/x.png?v=1',
          altText: 't',
          width: 2048,
          height: 2048,
        },
        media: {
          nodes: [
            {
              image: {
                url: 'https://cdn.shopify.com/s/files/1/0000/0001/files/x.png?v=1',
                altText: 't',
                width: 2048,
                height: 2048,
              },
            },
          ],
        },
        priceRange: {minVariantPrice: {amount: '100.0', currencyCode: 'PLN'}},
      },
      {
        id: 'gid://shopify/Product/2',
        title: 'Kolczyki test',
        handle: 'kolczyki-test',
        featuredImage: {
          url: 'https://cdn.shopify.com/s/files/1/0000/0001/files/y.png?v=1',
          altText: 'k',
          width: 2048,
          height: 2048,
        },
        media: {nodes: []},
        priceRange: {minVariantPrice: {amount: '200.0', currencyCode: 'PLN'}},
      },
    ],
  },
});

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
  if (body.includes('CampaignLandingProducts')) return PRODUCTS_BODY;
  if (body.includes('CampaignLanding')) {
    if (body.includes('organic-art-landing')) return ORGANIC_LANDING_BODY;
    if (body.includes('artisan-gold-landing')) return GOLD_LANDING_BODY;
    if (body.includes('artisan-rings-landing')) return RINGS_LANDING_BODY;
    return LANDING_BODY;
  }
  return JSON.stringify({data: null});
}

describe('dynamic-landing-liquid worker (Ads host)', () => {
  it('renders editorial forest_premium landing with product strip and process', async () => {
    const storefront = `https://${storefrontDomain()}`;
    fetchMock
      .get(storefront)
      .intercept({path: '/api/' + apiVersion() + '/graphql.json', method: 'POST'})
      .reply(200, graphqlReply, {headers: {'Content-Type': 'application/json'}})
      .times(3);

    const request = new Request(
      'https://l.epirbizuteria.pl/?utm_campaign=forest_premium',
    );
    const ctx = createExecutionContext();
    const testEnv = {...env, LANDINGS_ENABLED: 'true'};
    const response = await worker.fetch(request, testEnv);
    await waitOnExecutionContext(ctx);
    const html = await response.text();

    expect(response.headers.get('X-EPIR-Campaign-Handle')).toBe(
      'forest-premium-landing',
    );
    expect(response.headers.get('X-EPIR-Landing-Mode')).toBe('standalone');
    expect(html).toContain('Srebro z żywą powierzchnią');
    expect(html).toContain('id="proces"');
    expect(html).toContain('id="atelier-3d"');
    expect(html).toContain('asystent.epirbizuteria.pl/pixel');
    expect(html).toContain('Proces cyfrowo-rzemieślniczy');
    expect(html).toContain('Pierścionek test');
    expect(html).toContain('Kolczyki test');
    expect(html).toContain('Zobacz więcej');
    expect(html).toContain('/collections/bestsellery');
    expect(html).toContain('utm_campaign=artisan_rings');
    expect(html).toContain('Szukasz pierścionka zaręczynowego lub obrączki');
    expect(html).toContain('id="technical-foundry"');
    expect(html).toContain('Technical Foundry Section');
    expect(html).toContain('Fale Wody');
    expect(html).toContain('<picture>');
    expect(html).toContain('fetchpriority="high"');
    expect(html).toContain('texture-organic');
    expect(response.headers.get('Cache-Control')).toContain('max-age=60');
  });

  it('renders full organic_art editorial landing on l. host', async () => {
    const storefront = `https://${storefrontDomain()}`;
    fetchMock
      .get(storefront)
      .intercept({path: '/api/' + apiVersion() + '/graphql.json', method: 'POST'})
      .reply(200, graphqlReply, {headers: {'Content-Type': 'application/json'}})
      .times(3);

    const request = new Request(
      'https://l.epirbizuteria.pl/?utm_campaign=organic_art',
    );
    const ctx = createExecutionContext();
    const response = await worker.fetch(request, {
      ...env,
      LANDINGS_ENABLED: 'true',
    });
    await waitOnExecutionContext(ctx);
    const html = await response.text();

    expect(response.headers.get('X-EPIR-Campaign-Handle')).toBe(
      'organic-art-landing',
    );
    expect(response.headers.get('X-EPIR-Landing-Mode')).toBe('standalone');
    expect(html).toContain('Biżuteria, która ma teksturę');
    expect(html).toContain('Żywa powierzchnia');
    expect(html).toContain('id="wspoltworzenie"');
    expect(html).toContain('Przejdź do projektowania');
    expect(html).toContain('zaprojektuj-swoj-model');
    expect(html).toContain('/collections/kolekcja-galazki');
    expect(html).toContain('Zobacz więcej');
    expect(html).toContain('Pierścionek test');
    expect(html).toContain('tailwindcss.com');
  });

  it('renders artisan_gold editorial landing on l. host', async () => {
    const storefront = `https://${storefrontDomain()}`;
    fetchMock
      .get(storefront)
      .intercept({path: '/api/' + apiVersion() + '/graphql.json', method: 'POST'})
      .reply(200, graphqlReply, {headers: {'Content-Type': 'application/json'}})
      .times(3);

    const request = new Request(
      'https://l.epirbizuteria.pl/?utm_campaign=artisan_gold',
    );
    const ctx = createExecutionContext();
    const response = await worker.fetch(request, {
      ...env,
      LANDINGS_ENABLED: 'true',
    });
    await waitOnExecutionContext(ctx);
    const html = await response.text();

    expect(response.headers.get('X-EPIR-Campaign-Handle')).toBe(
      'artisan-gold-landing',
    );
    expect(html).toContain('Złoto formowane jak gałąź');
    expect(html).toContain('id="proces"');
    expect(html).toContain('Zobacz więcej');
    expect(html).toContain('Kolczyki test');
    expect(html).toContain('id="technical-authority"');
    expect(html).toContain('Twardość Vickersa');
    expect(html).toContain('Digital Co-creation');
    expect(html).toContain('3D-Agent');
    expect(html).toContain('id="most-kazka"');
    expect(html).toContain('kazka.epirbizuteria.pl');
    expect(html).toContain('artisan_gold_to_kazka');
    expect(html).toContain('kazka-bridge--whisper');
    expect(html).toContain('<picture>');
    expect(html).toContain('fetchpriority="high"');
  });

  it('renders artisan_rings with silver cross-bridge to forest_premium', async () => {
    const storefront = `https://${storefrontDomain()}`;
    fetchMock
      .get(storefront)
      .intercept({path: '/api/' + apiVersion() + '/graphql.json', method: 'POST'})
      .reply(200, graphqlReply, {headers: {'Content-Type': 'application/json'}})
      .times(3);

    const request = new Request(
      'https://l.epirbizuteria.pl/?utm_campaign=artisan_rings',
    );
    const ctx = createExecutionContext();
    const response = await worker.fetch(request, {
      ...env,
      LANDINGS_ENABLED: 'true',
    });
    await waitOnExecutionContext(ctx);
    const html = await response.text();

    expect(response.headers.get('X-EPIR-Campaign-Handle')).toBe(
      'artisan-rings-landing',
    );
    expect(html).toContain('Pierścionek przy niej, nie przed nią.');
    expect(html).toContain('id="grawer"');
    expect(html).toContain('Grawer zawsze gratis');
    expect(html).toContain('utm_campaign=forest_premium');
    expect(html).toContain('kolekcję leśną');
    expect(html).toContain('Kolekcja leśna');
    expect(html).not.toContain('id="most-kazka"');
  });

  it('redirects non-root paths on Ads host to apex store', async () => {
    const request = new Request('https://l.epirbizuteria.pl/products/x');
    const ctx = createExecutionContext();
    const response = await worker.fetch(request, {...env, LANDINGS_ENABLED: 'true'});
    await waitOnExecutionContext(ctx);
    expect(response.status).toBe(302);
    expect(response.headers.get('Location')).toContain('epirbizuteria.pl/products/x');
  });

  it('establishes preview session from epir_preview query', async () => {
    const request = new Request(
      'https://l.epirbizuteria.pl/?utm_campaign=forest_premium&epir_preview=op-test',
    );
    const ctx = createExecutionContext();
    const response = await worker.fetch(request, {
      ...env,
      LANDINGS_ENABLED: 'false',
      EPIR_OPERATOR_PANEL_SECRET: 'op-test',
    });
    await waitOnExecutionContext(ctx);

    expect(response.status).toBe(302);
    expect(response.headers.get('Location')).toBe(
      'https://l.epirbizuteria.pl/?utm_campaign=forest_premium',
    );
    expect(response.headers.get('Set-Cookie')).toContain('epir_landing_preview=');
    expect(response.headers.get('X-EPIR-Preview-Session')).toBe('established');
  });

  it('renders landing in operator preview when landings disabled', async () => {
    const storefront = `https://${storefrontDomain()}`;
    fetchMock
      .get(storefront)
      .intercept({path: '/api/' + apiVersion() + '/graphql.json', method: 'POST'})
      .reply(200, graphqlReply, {headers: {'Content-Type': 'application/json'}})
      .times(3);

    const request = new Request(
      'https://l.epirbizuteria.pl/?utm_campaign=forest_premium',
      {headers: {Cookie: 'epir_landing_preview=op-test'}},
    );
    const ctx = createExecutionContext();
    const response = await worker.fetch(request, {
      ...env,
      LANDINGS_ENABLED: 'false',
      EPIR_OPERATOR_PANEL_SECRET: 'op-test',
    });
    await waitOnExecutionContext(ctx);
    const html = await response.text();

    expect(response.status).toBe(200);
    expect(response.headers.get('X-EPIR-Landing-Preview')).toBe('true');
    expect(response.headers.get('Cache-Control')).toBe('no-store');
    expect(html).toContain('Proces cyfrowo-rzemieślniczy');
    expect(html).toContain('Zobacz więcej');
  });

  it('redirects to product page when landings disabled', async () => {
    const storefront = `https://${storefrontDomain()}`;
    fetchMock
      .get(storefront)
      .intercept({path: '/api/' + apiVersion() + '/graphql.json', method: 'POST'})
      .reply(200, graphqlReply, {headers: {'Content-Type': 'application/json'}})
      .times(3);

    const request = new Request(
      'https://l.epirbizuteria.pl/?utm_campaign=forest_premium',
    );
    const ctx = createExecutionContext();
    const response = await worker.fetch(request, {...env, LANDINGS_ENABLED: 'false'});
    await waitOnExecutionContext(ctx);

    expect(response.status).toBe(302);
    expect(response.headers.get('Location')).toContain('/products/pierscionek-test');
    expect(response.headers.get('X-EPIR-Landings-Enabled')).toBe('false');
    expect(response.headers.get('X-EPIR-Landing-Redirect')).toBe('product');
  });
});
