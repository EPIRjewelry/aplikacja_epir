import { describe, expect, it } from 'vitest';
import {
  buildLegacyTokenVaultShardName,
  buildShardDurableObjectName,
  buildTokenVaultShardName,
  getTokenVaultStub,
  getVaultShardCount,
  parseSelfRoutingToken,
  shardIdForCustomer,
  stableHashCustomerId,
} from '../src/token-vault';

describe('TokenVault sharding', () => {
  it('builds legacy shard name (migration / dual-read)', () => {
    expect(buildLegacyTokenVaultShardName('Epir-Art-Silver-Jewellery.myshopify.com')).toBe(
      'shop:epir-art-silver-jewellery.myshopify.com',
    );
  });

  it('buildTokenVaultShardName aliases legacy name', () => {
    expect(buildTokenVaultShardName('epirbizuteria.pl')).toBe('shop:epirbizuteria.pl');
  });

  it('normalizes casing and whitespace to the same legacy shard name', () => {
    const canonical = buildLegacyTokenVaultShardName('epirbizuteria.pl');
    const withMixedCase = buildLegacyTokenVaultShardName('  EpirBizuteria.PL ');
    expect(withMixedCase).toBe(canonical);
  });

  it('builds new per-shard DO name', () => {
    expect(buildShardDurableObjectName('Epir-Art-Silver-Jewellery.myshopify.com', 7)).toBe(
      'epir-art-silver-jewellery.myshopify.com#7',
    );
  });

  it('stableHash is deterministic', () => {
    expect(stableHashCustomerId('gid://shopify/Customer/1')).toBe(stableHashCustomerId('gid://shopify/Customer/1'));
    expect(stableHashCustomerId('a')).not.toBe(stableHashCustomerId('b'));
  });

  it('shardIdForCustomer stays within shard count', () => {
    const n = 32;
    for (const id of ['x', 'gid://shopify/Customer/999', 'cust_']) {
      const s = shardIdForCustomer(id, n);
      expect(s).toBeGreaterThanOrEqual(0);
      expect(s).toBeLessThan(n);
    }
  });

  it('parseSelfRoutingToken round-trips shop and shard', () => {
    const shop = 'epir-art-silver-jewellery.myshopify.com';
    const shard = 11;
    const secret = 'a'.repeat(64);
    const shopHex = [...new TextEncoder().encode(shop)].map((b) => b.toString(16).padStart(2, '0')).join('');
    const token = `epir_${shopHex}_${shard}_${secret}`;
    const parsed = parseSelfRoutingToken(token);
    expect(parsed).toEqual({ shopId: shop, shardId: shard, secret });
  });

  it('getTokenVaultStub routes new token to shard idFromName', () => {
    const shop = 'example.myshopify.com';
    const shard = 3;
    const secret = 'b'.repeat(64);
    const shopHex = [...new TextEncoder().encode(shop)].map((b) => b.toString(16).padStart(2, '0')).join('');
    const token = `epir_${shopHex}_${shard}_${secret}`;
    const expectedName = `${shop}#${shard}`;
    let seenName: string | null = null;
    const ns = {
      idFromName: (name: string) => {
        seenName = name;
        return { toString: () => `id:${name}` } as DurableObjectId;
      },
      get: (id: DurableObjectId) =>
        ({
          id: id.toString(),
        }) as DurableObjectStub,
    } as unknown as DurableObjectNamespace;
    const stub = getTokenVaultStub(ns, {}, { kind: 'token', token });
    expect(seenName).toBe(expectedName);
    expect((stub as { id: string }).id).toBe(`id:${expectedName}`);
  });

  it('getTokenVaultStub routes legacy token with fallback shop', () => {
    const legacy =
      '0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef';
    let seenName: string | null = null;
    const ns = {
      idFromName: (name: string) => {
        seenName = name;
        return { toString: () => `id:${name}` } as DurableObjectId;
      },
      get: (id: DurableObjectId) => ({ id: id.toString() }) as DurableObjectStub,
    } as unknown as DurableObjectNamespace;
    getTokenVaultStub(ns, {}, { kind: 'token', token: legacy, fallbackShopId: 'Foo.MyShopify.COM' });
    expect(seenName).toBe('shop:foo.myshopify.com');
  });

  it('getVaultShardCount clamps to 16–64', () => {
    expect(getVaultShardCount({ VAULT_SHARD_COUNT: '8' })).toBe(16);
    expect(getVaultShardCount({ VAULT_SHARD_COUNT: '100' })).toBe(64);
    expect(getVaultShardCount({ VAULT_SHARD_COUNT: '48' })).toBe(48);
  });
});
