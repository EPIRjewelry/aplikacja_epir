import { describe, it, expect } from 'vitest';
import { sanitizePixelEventData } from './pixel-event-privacy';
import { PII, checkoutFixture } from './__checkout-fixture';

const TYPES = ['checkout_started','checkout_contact_info_submitted','checkout_address_info_submitted','checkout_shipping_info_submitted','payment_info_submitted','checkout_completed'];
describe('checkout allowlist (pixel)', () => {
  for (const t of TYPES) {
    it(`${t}: no PII, analytics fields kept`, () => {
      const ev = { id: 'e1', name: t, clientId: 'c1', timestamp: 'x', seq: 1, type: 'standard', context: { document: { location: { href: 'https://epirbizuteria.pl/checkouts/cn/x' } } }, data: { checkout: checkoutFixture(), extra: 'PII_ATTR' } };
      const out = sanitizePixelEventData(t, ev) as any;
      const s = JSON.stringify(out);
      for (const p of PII) expect(s).not.toContain(p);
      expect(out.clientId).toBe('c1');
      const c = out.data.checkout;
      expect(c.token).toBe('chk-token-1');
      expect(c.totalPrice).toEqual({ amount: 115, currencyCode: 'PLN' });
      expect(c.order).toEqual({ id: 'gid://shopify/Order/1904', customer: { isFirstOrder: true } });
      expect(c.lineItems[0]).toEqual({ id: 'li1', quantity: 1, title: 'Pierścionek Soliter', finalLinePrice: { amount: 100, currencyCode: 'PLN' }, variant: { id: 'gid://shopify/ProductVariant/1', title: '14', sku: 'SKU1', price: { amount: 110, currencyCode: 'PLN' }, product: { id: 'gid://shopify/Product/1', title: 'Pierścionek Soliter', type: 'Pierścionek', vendor: 'EPIR', url: '/products/soliter' } } });
      expect(c.transactions[0].paymentMethod).toEqual({ type: 'local', name: 'BLIK' });
      expect(Object.keys(out.data)).toEqual(['checkout']);
      expect(ev.data.checkout.email).toBe('pii-buyer@example.com'); // input not mutated
    });
  }
  it('alert_displayed drops value', () => {
    const out = sanitizePixelEventData('alert_displayed', { data: { alert: { type: 'INPUT_INVALID', message: 'Podaj poprawny e-mail', target: 'cart.buyerIdentity.email', value: 'PII_ALERT_VALUE' } } }) as any;
    expect(out.data.alert).toEqual({ type: 'INPUT_INVALID', message: 'Podaj poprawny e-mail', target: 'cart.buyerIdentity.email' });
  });
  it('other types untouched', () => {
    const ev = { data: { productVariant: { id: 'v' } } };
    expect(sanitizePixelEventData('product_viewed', ev)).toBe(ev);
  });
});
