const TEST_CUSTOMER_GID = 'gid://shopify/Customer/9001002001';

function encodeJwtPayload(payload: Record<string, unknown>): string {
  const header = Buffer.from(JSON.stringify({alg: 'none', typ: 'JWT'})).toString(
    'base64url',
  );
  const body = Buffer.from(JSON.stringify(payload)).toString('base64url');
  return `${header}.${body}.sig`;
}

export function buildMockIdToken(nonce: string, sub = TEST_CUSTOMER_GID): string {
  return encodeJwtPayload({nonce, sub});
}

export type IntegrationFetchStubOptions = {
  shopDomain: string;
  apiVersion: string;
  shopId: string;
  /** Nonce for the in-flight CAA authorize (from login redirect URL, not cookie). */
  getAuthorizeNonce: () => string | undefined;
};

export function createIntegrationFetchStub(options: IntegrationFetchStubOptions) {
  const storefrontGraphqlUrl = `https://${options.shopDomain}/api/${options.apiVersion}/graphql.json`;
  const tokenUrl = `https://shopify.com/authentication/${options.shopId}/oauth/token`;

  return async function integrationFetch(
    input: RequestInfo | URL,
    init?: RequestInit,
  ): Promise<Response> {
    const url =
      typeof input === 'string'
        ? input
        : input instanceof URL
          ? input.href
          : input.url;

    if (url === storefrontGraphqlUrl && init?.method === 'POST') {
      const rawBody =
        typeof init.body === 'string'
          ? init.body
          : init.body instanceof Uint8Array
            ? new TextDecoder().decode(init.body)
            : '';
      const json = stubStorefrontGraphql(rawBody);
      return new Response(JSON.stringify(json), {
        status: 200,
        headers: {'content-type': 'application/json'},
      });
    }

    if (url === tokenUrl && init?.method === 'POST') {
      const nonce = options.getAuthorizeNonce();
      if (!nonce) {
        throw new Error('integration fetch: authorize nonce not set for token stub');
      }
      const idToken = buildMockIdToken(nonce);
      return new Response(
        JSON.stringify({
          access_token: 'integration-access-token',
          expires_in: 3600,
          refresh_token: 'integration-refresh-token',
          id_token: idToken,
        }),
        {status: 200, headers: {'content-type': 'application/json'}},
      );
    }

    throw new Error(`integration fetch not stubbed: ${url}`);
  };
}

function stubStorefrontGraphql(body: string) {
  if (body.includes('query layout') || body.includes('layout')) {
    return {data: {shop: {name: 'EPIR Test', description: 'integration'}}};
  }
  if (body.includes('LayoutCollections') || body.includes('collections')) {
    return {data: {collections: {nodes: []}}};
  }
  if (body.includes('cartCreate')) {
    return {
      data: {
        cartCreate: {
          cart: {
            id: 'gid://shopify/Cart/integration-cart',
            checkoutUrl: 'https://checkout.shopify.com/cart',
          },
          userErrors: [],
        },
      },
    };
  }
  if (body.includes('cartLinesAdd')) {
    return {
      data: {
        cartLinesAdd: {
          cart: {
            id: 'gid://shopify/Cart/integration-cart',
            checkoutUrl: 'https://checkout.shopify.com/cart',
          },
          userErrors: [],
        },
      },
    };
  }
  if (body.includes('CartQuery') || body.includes('cart(id:')) {
    return {
      data: {
        cart: {
          id: 'gid://shopify/Cart/integration-cart',
          updatedAt: new Date().toISOString(),
          checkoutUrl: 'https://checkout.shopify.com/cart',
          totalQuantity: 0,
          buyerIdentity: {countryCode: 'PL'},
          lines: {edges: []},
          cost: {
            subtotalAmount: {amount: '0', currencyCode: 'PLN'},
            totalAmount: {amount: '0', currencyCode: 'PLN'},
          },
        },
      },
    };
  }
  return {data: {}};
}

export {TEST_CUSTOMER_GID};
