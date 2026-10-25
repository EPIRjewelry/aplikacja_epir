import {afterEach, describe, expect, it, vi} from 'vitest';
import {action} from './api.chat';

const TEST_GID = 'gid://shopify/Customer/1848062312553';

function idToken(sub: string): string {
  return `e30.${btoa(JSON.stringify({sub}))}.sig`;
}

function chatRequest() {
  return new Request('https://kazka.epirbizuteria.pl/api/chat', {
    method: 'POST',
    headers: {'Content-Type': 'application/json'},
    body: JSON.stringify({message: 'hej', stream: false, session_id: 'sess_kazka'}),
  });
}

describe('api.chat customer GID header', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it('dokleja X-EPIR-LOGGED-IN-CUSTOMER-ID gdy sesja CAA ma GID', async () => {
    const captured: Record<string, string>[] = [];
    vi.stubGlobal(
      'fetch',
      vi.fn(async (_input: RequestInfo | URL, init?: RequestInit) => {
        captured.push((init?.headers ?? {}) as Record<string, string>);
        return new Response(JSON.stringify({type: 'message', reply: 'ok'}), {
          status: 200,
          headers: {'content-type': 'application/json'},
        });
      }),
    );

    const response = await action({
      request: chatRequest(),
      context: {
        env: {EPIR_CHAT_SHARED_SECRET: 'sekret'},
        customerAccount: {isLoggedIn: async () => true},
        session: {
          get: (key: string) =>
            key === 'customerAccount' ? {idToken: idToken(TEST_GID)} : undefined,
        },
      },
      params: {},
    } as never);

    expect(response.status).toBe(200);
    expect(captured[0]?.['X-EPIR-LOGGED-IN-CUSTOMER-ID']).toBe(TEST_GID);
    expect(captured[0]?.['X-EPIR-CHANNEL']).toBe('hydrogen-kazka');
    expect(captured[0]?.['X-EPIR-STOREFRONT-ID']).toBe('kazka');
  });

  it('bez sesji CAA nie wysyła nagłówka klienta', async () => {
    const captured: Record<string, string>[] = [];
    vi.stubGlobal(
      'fetch',
      vi.fn(async (_input: RequestInfo | URL, init?: RequestInit) => {
        captured.push((init?.headers ?? {}) as Record<string, string>);
        return new Response(JSON.stringify({type: 'message', reply: 'ok'}), {
          status: 200,
          headers: {'content-type': 'application/json'},
        });
      }),
    );

    const response = await action({
      request: chatRequest(),
      context: {
        env: {EPIR_CHAT_SHARED_SECRET: 'sekret'},
        customerAccount: null,
        session: {get: () => undefined},
      },
      params: {},
    } as never);

    expect(response.status).toBe(200);
    expect(captured[0]?.['X-EPIR-LOGGED-IN-CUSTOMER-ID']).toBeUndefined();
  });
});
