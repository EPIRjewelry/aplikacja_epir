import { describe, expect, it } from 'vitest';
import { runOperatorShopifyAdminRead } from '../src/operator/operator-shopify-admin-tools';
import type { Env } from '../src/config/bindings';

describe('operator_shopify_admin_read', () => {
  it('requires SHOPIFY_ADMIN_TOKEN', async () => {
    const env = { SHOP_DOMAIN: 'shop.myshopify.com' } as unknown as Env;
    const out = await runOperatorShopifyAdminRead(env, 'A1_PRODUCTS_RECENT');
    expect(out.error?.message).toContain('SHOPIFY_ADMIN_TOKEN');
  });

  it('rejects unknown presetId', async () => {
    const env = {
      SHOP_DOMAIN: 'shop.myshopify.com',
      SHOPIFY_ADMIN_TOKEN: 'tok',
    } as unknown as Env;
    const out = await runOperatorShopifyAdminRead(env, 'INVALID');
    expect(out.error?.message).toContain('Invalid presetId');
  });
});
