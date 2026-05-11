import { describe, expect, it } from 'vitest';
import { buildTokenVaultShardName } from '../src/token-vault';

describe('TokenVault sharding', () => {
  it('builds deterministic shard name from shop id', () => {
    expect(buildTokenVaultShardName('Epir-Art-Silver-Jewellery.myshopify.com')).toBe(
      'shop:epir-art-silver-jewellery.myshopify.com',
    );
  });
});
