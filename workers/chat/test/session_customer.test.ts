import { describe, it, expect } from 'vitest';
import { resolveEffectiveShopifyCustomerId, SessionDO } from '../src/index';
import { makeDurableStateStub } from './helpers/session-do-sql-stub';

describe('SessionDO customer', () => {
  it('should set and return customer', async () => {
    const { state } = makeDurableStateStub();
    const doStub = new SessionDO(state, {} as any);

    const res = await doStub.fetch(new Request('https://session/set-customer', {
      method: 'POST', body: JSON.stringify({ customer_id: 'gid://shopify/Customer/123', first_name: 'Anna' }), headers: { 'Content-Type': 'application/json' }
    }));
    expect(res.status).toBe(200);

    const get = await doStub.fetch(new Request('https://session/customer', { method: 'GET' }));
    const json = (await get.json()) as {
      customer: { customer_id: string; first_name: string } | null;
    };
    expect(json.customer).not.toBeNull();
    const customer = json.customer!;
    expect(customer.customer_id).toBe('gid://shopify/Customer/123');
    expect(customer.first_name).toBe('Anna');
  });

  it('prefers request customer id over session fallback', () => {
    expect(
      resolveEffectiveShopifyCustomerId('gid://shopify/Customer/111', 'gid://shopify/Customer/222'),
    ).toEqual({
      customerId: 'gid://shopify/Customer/111',
      source: 'request',
    });
  });

  it('falls back to session customer id when request customer id is missing', () => {
    expect(resolveEffectiveShopifyCustomerId('', 'gid://shopify/Customer/222')).toEqual({
      customerId: 'gid://shopify/Customer/222',
      source: 'session',
    });
  });

  it('returns none when neither request nor session customer id exists', () => {
    expect(resolveEffectiveShopifyCustomerId('   ', null)).toEqual({
      customerId: null,
      source: 'none',
    });
  });
});
