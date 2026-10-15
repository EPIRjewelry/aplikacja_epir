import { describe, it, expect, afterEach, beforeAll } from 'vitest';
import { env, SELF } from 'cloudflare:test';
import scrubSql from '../migrations/008_scrub_checkout_pii.sql?raw';
import { PII, checkoutFixture } from './__checkout-fixture';

async function post(body: unknown) {
  const r = await SELF.fetch('https://example.com/pixel', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
  expect(r.status).toBe(200);
}
async function rows(type: string) {
  const p = await env.DB.prepare('SELECT raw_data, checkout_token FROM pixel_events WHERE event_type = ?').bind(type).all<{ raw_data: string; checkout_token: string | null }>();
  const c = await env.DB.prepare('SELECT event_data FROM customer_events WHERE event_type = ?').bind(type).all<{ event_data: string }>();
  return { p: p.results, c: c.results };
}
function noPii(s: string) { for (const x of PII) expect(s).not.toContain(x); }

describe('checkout PII allowlist (worker)', () => {
  beforeAll(async () => { await post({ type: 'page_viewed', data: { sessionId: 'init' } }); });
  afterEach(async () => {
    await env.DB.prepare('DELETE FROM pixel_events').run();
    await env.DB.prepare('DELETE FROM customer_events').run();
  });

  it('app pixel shape (data.data.checkout): no PII in raw_data nor event_data', async () => {
    await post({ type: 'checkout_completed', data: { id: 'e', name: 'checkout_completed', clientId: 'cs1', sessionId: 'cs1', session_id: 'cs1', context: {}, data: { checkout: checkoutFixture() } } });
    const { p, c } = await rows('checkout_completed');
    expect(p).toHaveLength(1); expect(c).toHaveLength(1);
    noPii(p[0].raw_data); noPii(c[0].event_data);
    const raw = JSON.parse(p[0].raw_data);
    expect(raw.data.data.checkout.token).toBe('chk-token-1');
    expect(raw.data.data.checkout.order.id).toBe('gid://shopify/Order/1904');
    expect(raw.data.data.checkout.lineItems[0].variant.product.id).toBe('gid://shopify/Product/1');
  });

  it('paste shape (data.checkout): no PII, checkout_token column still filled', async () => {
    await post({ type: 'checkout_started', data: { clientId: 'cs2', sessionId: 'cs2', session_id: 'cs2', checkout: checkoutFixture() } });
    const { p, c } = await rows('checkout_started');
    noPii(p[0].raw_data); noPii(c[0].event_data);
    expect(p[0].checkout_token).toBe('chk-token-1');
  });

  it('alert_displayed: value dropped', async () => {
    await post({ type: 'alert_displayed', data: { sessionId: 'cs3', data: { alert: { type: 'INPUT_INVALID', message: 'Podaj e-mail', target: 't', value: 'PII_ALERT_VALUE' } } } });
    const { p, c } = await rows('alert_displayed');
    noPii(p[0].raw_data); noPii(c[0].event_data);
  });

  it('migration 008 scrubs legacy rows in both tables, is idempotent, skips invalid JSON', async () => {
    const legacyApp = JSON.stringify({ event: 'checkout_completed', data: { clientId: 'x', data: { checkout: checkoutFixture() } }, timestamp: 1 });
    const legacyPaste = JSON.stringify({ event: 'checkout_started', data: { clientId: 'x', checkout: checkoutFixture() }, timestamp: 1 });
    const legacyAlert = JSON.stringify({ event: 'alert_displayed', data: { data: { alert: { type: 'X', value: 'PII_ALERT_VALUE' } } }, timestamp: 1 });
    const legacyForm = JSON.stringify({ event: 'form_submitted', data: { data: { element: { id: 'f', elements: [{ value: 'pii-buyer@example.com' }] } } }, timestamp: 1 });
    let id = 1;
    for (const [t, j] of [['checkout_completed', legacyApp], ['checkout_started', legacyPaste], ['alert_displayed', legacyAlert], ['checkout_started', 'not json']] as const) {
      await env.DB.prepare('INSERT INTO pixel_events (id, event_type, event_name, created_at, raw_data) VALUES (?1, ?2, ?2, ?3, ?4)').bind(id++, t, new Date().toISOString(), j).run();
    }
    for (const [t, j] of [['checkout_completed', legacyApp], ['checkout_started', legacyPaste], ['alert_displayed', legacyAlert], ['form_submitted', legacyForm]] as const) {
      await env.DB.prepare('INSERT INTO customer_events (customer_id, session_id, event_type, event_timestamp, event_data, created_at) VALUES (?1, ?2, ?3, ?4, ?5, ?4)').bind('anonymous', 's', t, Date.now(), j).run();
    }
    const stmts = scrubSql.split(/;\s*\n/).map((s) => s.replace(/^\s*--.*$/gm, '').trim()).filter(Boolean);
    for (let pass = 0; pass < 2; pass++) await env.DB.batch(stmts.map((s) => env.DB.prepare(s)));
    const p = await env.DB.prepare('SELECT event_type, raw_data FROM pixel_events ORDER BY id').all<{ event_type: string; raw_data: string }>();
    const c = await env.DB.prepare('SELECT event_type, event_data FROM customer_events ORDER BY id').all<{ event_type: string; event_data: string }>();
    for (const r of p.results) noPii(r.raw_data);
    for (const r of c.results) noPii(r.event_data);
    expect(p.results[3].raw_data).toBe('not json');
    const app = JSON.parse(p.results[0].raw_data).data.data.checkout;
    expect(app.token).toBe('chk-token-1');
    expect(app.order).toEqual({ id: 'gid://shopify/Order/1904', customer: { isFirstOrder: true } });
    expect(app.lineItems[0].variant.product.id).toBe('gid://shopify/Product/1');
    expect(JSON.parse(p.results[1].raw_data).data.checkout.totalPrice).toEqual({ amount: 115, currencyCode: 'PLN' });
  });
});
