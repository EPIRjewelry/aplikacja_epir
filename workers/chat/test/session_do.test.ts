import { describe, it, expect } from 'vitest';
import { SessionDO } from '../src/index';
import { makeDurableStateStub } from './helpers/session-do-sql-stub';

const mockEnv = {} as any;

function makeD1Capture() {
  const writes: Array<{ sql: string; args: unknown[] }> = [];
  const db = {
    prepare(sql: string) {
      return {
        bind(...args: unknown[]) {
          return {
            async run() {
              writes.push({ sql, args });
              return { success: true, meta: {} };
            },
          };
        },
      };
    },
  } as unknown as D1Database;

  return { db, writes };
}

describe('SessionDO', () => {
  it('should append and retrieve history', async () => {
    const { state } = makeDurableStateStub();
    const doStub = new SessionDO(state, mockEnv);

    const req = new Request('https://session/append', {
      method: 'POST',
      body: JSON.stringify({ role: 'user', content: 'Hello', ts: Date.now() }),
      headers: { 'Content-Type': 'application/json' }
    });

    const res = await doStub.fetch(req);
    expect(res.status).toBe(200);

    const historyRes = await doStub.fetch(new Request('https://session/history'));
    const history = (await historyRes.json()) as any[];
    expect(Array.isArray(history)).toBeTruthy();
    expect(history.length).toBe(1);
    expect(history[0].role).toBe('user');
    expect(history[0].content).toBe('Hello');
  });

  it('should set and get session id and cart id', async () => {
    const { state } = makeDurableStateStub();
    const doStub = new SessionDO(state, mockEnv);

    const setSession = await doStub.fetch(new Request('https://session/set-session-id', {
      method: 'POST',
      body: JSON.stringify({ session_id: 'abc-123' }),
      headers: { 'Content-Type': 'application/json' }
    }));
    expect(setSession.ok).toBeTruthy();

    const setCart = await doStub.fetch(new Request('https://session/set-cart-id', {
      method: 'POST',
      body: JSON.stringify({ cart_id: 'gid://shopify/Cart/xyz' }),
      headers: { 'Content-Type': 'application/json' }
    }));
    expect(setCart.ok).toBeTruthy();

    const cartRes = await doStub.fetch(new Request('https://session/cart-id'));
    const cartData = (await cartRes.json()) as any;
    expect(cartData.cart_id).toBe('gid://shopify/Cart/xyz');
  });

  it('should enforce local rate limit for DO endpoints', async () => {
    const { state } = makeDurableStateStub();
    const doStub = new SessionDO(state, mockEnv);

    // hit the endpoint many times
    for (let i = 0; i < 21; i++) {
      const r = await doStub.fetch(new Request('https://session/history'));
      if (i < 20) expect(r.status).toBe(200);
      else expect(r.status).toBe(429);
    }

  });

  it('should replace latest user message text by timestamp', async () => {
    const { state } = makeDurableStateStub();
    const doStub = new SessionDO(state, mockEnv);
    const ts = Date.now();

    await doStub.fetch(
      new Request('https://session/append', {
        method: 'POST',
        body: JSON.stringify({ role: 'user', content: '(załącznik obrazu)', ts }),
        headers: { 'Content-Type': 'application/json' },
      }),
    );

    const replaceRes = await doStub.fetch(
      new Request('https://session/replace-last-user-text', {
        method: 'POST',
        body: JSON.stringify({
          ts,
          expected_content: '(załącznik obrazu)',
          content: 'Użytkownik przesłał zdjęcie. Opis: pierścionek z diamentem.',
        }),
        headers: { 'Content-Type': 'application/json' },
      }),
    );
    expect(replaceRes.ok).toBeTruthy();

    const historyRes = await doStub.fetch(new Request('https://session/history'));
    const history = (await historyRes.json()) as any[];
    expect(history.length).toBe(1);
    expect(history[0].role).toBe('user');
    expect(history[0].content).toContain('Użytkownik przesłał zdjęcie.');
  });

  it('should preserve tool call entries in history', async () => {
    const { state } = makeDurableStateStub();
    const doStub = new SessionDO(state, mockEnv);

    await doStub.fetch(
      new Request('https://session/append', {
        method: 'POST',
        body: JSON.stringify({
          role: 'assistant',
          content: '',
          ts: Date.now(),
          tool_calls: [
            {
              id: 'call_1',
              type: 'function',
              function: { name: 'search_catalog', arguments: '{"catalog":{"query":"ring"}}' },
            },
          ],
        }),
        headers: { 'Content-Type': 'application/json' },
      }),
    );

    const historyRes = await doStub.fetch(new Request('https://session/history'));
    const history = (await historyRes.json()) as Array<Record<string, unknown>>;
    expect(history).toHaveLength(1);
    expect(history[0].tool_calls).toBeTruthy();
    expect(Array.isArray(history[0].tool_calls)).toBe(true);
  });

  it('should mark replay signature as used on duplicate requests', async () => {
    const { state } = makeDurableStateStub();
    const doStub = new SessionDO(state, mockEnv);

    const first = await doStub.fetch(
      new Request('https://session/replay-check', {
        method: 'POST',
        body: JSON.stringify({ signature: 'abc', timestamp: String(Date.now()) }),
        headers: { 'Content-Type': 'application/json' },
      }),
    );
    const firstJson = (await first.json()) as { used: boolean };
    expect(firstJson.used).toBe(false);

    const second = await doStub.fetch(
      new Request('https://session/replay-check', {
        method: 'POST',
        body: JSON.stringify({ signature: 'abc', timestamp: String(Date.now()) }),
        headers: { 'Content-Type': 'application/json' },
      }),
    );
    const secondJson = (await second.json()) as { used: boolean };
    expect(secondJson.used).toBe(true);
  });

  it('should replace the newest matching user message when timestamps collide', async () => {
    const { state } = makeDurableStateStub();
    const doStub = new SessionDO(state, mockEnv);
    const ts = Date.now();

    await doStub.fetch(
      new Request('https://session/append', {
        method: 'POST',
        body: JSON.stringify({ role: 'user', content: 'pierwsza wiadomość', ts }),
        headers: { 'Content-Type': 'application/json' },
      }),
    );
    await doStub.fetch(
      new Request('https://session/append', {
        method: 'POST',
        body: JSON.stringify({ role: 'user', content: '(załącznik obrazu)', ts }),
        headers: { 'Content-Type': 'application/json' },
      }),
    );

    await doStub.fetch(
      new Request('https://session/replace-last-user-text', {
        method: 'POST',
        body: JSON.stringify({
          ts,
          expected_content: '(załącznik obrazu)',
          content: 'opis drugiej wiadomości',
        }),
        headers: { 'Content-Type': 'application/json' },
      }),
    );

    const historyRes = await doStub.fetch(new Request('https://session/history'));
    const history = (await historyRes.json()) as Array<{ content: string }>;
    expect(history[0].content).toBe('pierwsza wiadomość');
    expect(history[1].content).toBe('opis drugiej wiadomości');
  });

  it('should persist write-through records to D1 with idempotent keys', async () => {
    const { state } = makeDurableStateStub('persist-session');
    const { db, writes } = makeD1Capture();
    const doStub = new SessionDO(state, { DB_CHATBOT: db } as any);

    await doStub.fetch(
      new Request('https://session/set-session-id', {
        method: 'POST',
        body: JSON.stringify({ session_id: 'persist-session' }),
        headers: { 'Content-Type': 'application/json' },
      }),
    );

    await doStub.fetch(
      new Request('https://session/set-storefront-context', {
        method: 'POST',
        body: JSON.stringify({ storefront_id: 'kazka', channel: 'hydrogen-kazka' }),
        headers: { 'Content-Type': 'application/json' },
      }),
    );

    await doStub.fetch(
      new Request('https://session/append', {
        method: 'POST',
        body: JSON.stringify({ role: 'user', content: 'hello', ts: 111 }),
        headers: { 'Content-Type': 'application/json' },
      }),
    );

    await doStub.fetch(
      new Request('https://session/persist-tool-call', {
        method: 'POST',
        body: JSON.stringify({
          tool_call_uid: 'persist-session:tool:111:call_1',
          tool_name: 'search_catalog',
          arguments: { catalog: { query: 'ring' } },
          result: { items: [] },
          status: 'success',
          duration_ms: 12,
          timestamp: 112,
        }),
        headers: { 'Content-Type': 'application/json' },
      }),
    );

    await doStub.fetch(
      new Request('https://session/persist-usage', {
        method: 'POST',
        body: JSON.stringify({
          usage_uid: 'persist-session:usage:111:0',
          model: '@cf/moonshotai/kimi-k2.5',
          prompt_tokens: 10,
          completion_tokens: 5,
          total_tokens: 15,
          timestamp: 113,
        }),
        headers: { 'Content-Type': 'application/json' },
      }),
    );

    await doStub.fetch(
      new Request('https://session/persist-cart-activity', {
        method: 'POST',
        body: JSON.stringify({
          items: [
            {
              activity_uid: 'persist-session:tool:111:call_1:add:0',
              cart_id: 'gid://shopify/Cart/1?key=abc',
              action: 'add',
              variant_id: 'gid://shopify/ProductVariant/1',
              quantity: 1,
              timestamp: 114,
            },
          ],
        }),
        headers: { 'Content-Type': 'application/json' },
      }),
    );

    expect(writes.some((entry) => entry.sql.includes('INSERT INTO sessions'))).toBe(true);
    expect(writes.some((entry) => entry.sql.includes('INSERT INTO messages'))).toBe(true);
    expect(writes.some((entry) => entry.sql.includes('INSERT INTO tool_calls'))).toBe(true);
    expect(writes.some((entry) => entry.sql.includes('INSERT INTO usage_stats'))).toBe(true);
    expect(writes.some((entry) => entry.sql.includes('INSERT INTO cart_activity'))).toBe(true);

    const messageWrite = writes.find((entry) => entry.sql.includes('INSERT INTO messages'));
    expect(messageWrite?.args.at(-1)).toBe('persist-session:msg:1');

    expect(
      writes.some((entry) => entry.sql.includes('INSERT INTO sessions') && entry.args.includes('kazka')),
    ).toBe(true);
    expect(
      writes.some((entry) => entry.sql.includes('INSERT INTO sessions') && entry.args.includes('hydrogen-kazka')),
    ).toBe(true);
    expect(
      writes.some((entry) => entry.sql.includes('INSERT INTO sessions') && entry.args.includes('ok')),
    ).toBe(true);
  });
});
