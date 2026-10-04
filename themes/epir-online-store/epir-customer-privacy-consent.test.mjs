import assert from 'node:assert/strict';
import fs from 'node:fs';
import { dirname, join } from 'node:path';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';

const root = dirname(fileURLToPath(import.meta.url));
const require = createRequire(import.meta.url);
const api = require('./assets/epir-customer-privacy-consent.js');

function el(spec, parent) {
  return {
    tagName: spec.tag || 'DIV',
    id: spec.id || '',
    className: spec.className || '',
    textContent: spec.text || '',
    directText: spec.directText,
    attributes: spec.attributes || {},
    childNodes: spec.childNodes || [],
    parentElement: parent || null,
    getAttribute(name) {
      if (!Object.prototype.hasOwnProperty.call(this.attributes, name)) return null;
      return this.attributes[name];
    },
  };
}

function clickTarget(nodesOuterToInner) {
  let parent = null;
  let node = null;
  for (const spec of nodesOuterToInner) {
    node = el(spec, parent);
    parent = node;
  }
  return node;
}

function fakeDoc() {
  const listeners = [];
  return {
    addEventListener(type, fn) {
      assert.equal(type, 'click');
      listeners.push(fn);
    },
    dispatch(target) {
      for (const fn of listeners) fn({ target });
    },
  };
}

test('payload matches CustomerPrivacyConsentBridge and grants analytics only for true', () => {
  assert.deepEqual(api.trackingConsentPayload(true), {
    analytics: true,
    marketing: true,
    preferences: true,
    sale_of_data: true,
  });
  assert.deepEqual(api.trackingConsentPayload(false), {
    analytics: false,
    marketing: false,
    preferences: false,
    sale_of_data: false,
  });
  assert.equal(api.trackingConsentPayload(undefined), null);
  assert.equal(api.trackingConsentPayload(null), null);
  assert.equal(api.trackingConsentPayload('true'), null);
  assert.equal(api.trackingConsentPayload('yes'), null);
});

test('Zaakceptuj inside the cookie banner grants analytics; Odrzuć denies it', () => {
  const accept = clickTarget([
    { id: 'm-cookie-banner', className: 'm-cookie-banner' },
    { tag: 'BUTTON', className: 'm-button m-button--primary', text: 'Zaakceptuj' },
  ]);
  const reject = clickTarget([
    { className: 'cookie-banner' },
    { tag: 'BUTTON', text: 'Odrzuć' },
  ]);
  assert.equal(api.decisionFromClick(accept), true);
  assert.equal(api.decisionFromClick(reject), false);
});

test('Nie akceptuję is a reject, and Zaakceptuj wszystkie is an accept', () => {
  const reject = clickTarget([
    { className: 'cookie-banner' },
    { tag: 'BUTTON', text: 'Nie akceptuję' },
  ]);
  const accept = clickTarget([
    { className: 'cookie-banner' },
    { tag: 'BUTTON', text: 'Zaakceptuj wszystkie' },
  ]);
  assert.equal(api.decisionFromClick(reject), false);
  assert.equal(api.decisionFromClick(accept), true);
});

test('banner copy and the banner chrome are not an accept', () => {
  const paragraph = clickTarget([
    { className: 'm-cookie-banner' },
    {
      tag: 'P',
      text: 'Używamy plików cookie, aby mierzyć ruch w sklepie. Wybierz Zaakceptuj albo Odrzuć.',
    },
  ]);
  const chrome = clickTarget([
    { className: 'm-cookie-banner', text: 'Zaakceptuj Odrzuć' },
  ]);
  assert.equal(api.decisionFromClick(paragraph), null);
  assert.equal(api.decisionFromClick(chrome), null);
});

test('the same labels outside the banner do not grant or deny analytics', () => {
  const stray = clickTarget([
    { id: 'MainContent' },
    { tag: 'BUTTON', text: 'Zaakceptuj' },
  ]);
  assert.equal(api.decisionFromClick(stray), null);
});

test('manage preferences is not an analytics decision', () => {
  const manage = clickTarget([
    { id: 'shopify-pc__banner', className: 'shopify-pc__banner__dialog' },
    { tag: 'BUTTON', className: 'shopify-pc__banner__btn-manage-prefs', text: 'Zarządzaj preferencjami' },
  ]);
  assert.equal(api.decisionFromClick(manage), null);
});

test('Shopify privacy banner accept and decline map to the consent booleans', () => {
  const accept = clickTarget([
    { id: 'shopify-pc__banner', className: 'shopify-pc__banner__dialog' },
    { tag: 'BUTTON', className: 'shopify-pc__banner__btn-accept' },
  ]);
  const decline = clickTarget([
    { id: 'shopify-pc__banner', className: 'shopify-pc__banner__dialog' },
    { tag: 'BUTTON', className: 'shopify-pc__banner__btn-decline', text: 'Odrzuć' },
  ]);
  assert.equal(api.decisionFromClick(accept), true);
  assert.equal(api.decisionFromClick(decline), false);
});

test('explicit reject wins over an accept label', () => {
  const button = clickTarget([
    { className: 'm-cookie-banner' },
    {
      tag: 'BUTTON',
      text: 'Zaakceptuj',
      attributes: { 'data-epir-consent': 'reject' },
    },
  ]);
  assert.equal(api.decisionFromClick(button), false);
});

test('conflicting accept and reject markers do not grant analytics', () => {
  const button = clickTarget([
    { className: 'm-cookie-banner' },
    { tag: 'BUTTON', className: 'btn-accept btn-decline', text: 'Zaakceptuj' },
  ]);
  assert.equal(api.decisionFromClick(button), null);
});

test('install does not call setTrackingConsent until a banner click', () => {
  const calls = [];
  const win = {
    Shopify: {
      customerPrivacy: {
        setTrackingConsent(payload) {
          calls.push(payload);
        },
      },
    },
    setTimeout() {
      throw new Error('timer without a click');
    },
  };
  api.install(win, fakeDoc());
  assert.deepEqual(calls, []);
});

test('accept click writes the Hydrogen consent object; reject writes analytics false', () => {
  const calls = [];
  const win = {
    Shopify: {
      customerPrivacy: {
        setTrackingConsent(payload, cb) {
          calls.push(payload);
          cb({});
        },
      },
    },
  };
  const doc = fakeDoc();
  api.install(win, doc);
  doc.dispatch(clickTarget([
    { className: 'm-cookie-banner' },
    { tag: 'BUTTON', text: 'Zaakceptuj' },
  ]));
  doc.dispatch(clickTarget([
    { className: 'm-cookie-banner' },
    { tag: 'BUTTON', text: 'Odrzuć' },
  ]));
  assert.equal(calls[0].analytics, true);
  assert.equal(calls[1].analytics, false);
  assert.deepEqual(calls[1], api.trackingConsentPayload(false));
});

test('loads consent-tracking-api 0.1 before setTrackingConsent when the API is absent', () => {
  const calls = [];
  const features = [];
  const shopify = {
    loadFeatures(requested, cb) {
      features.push(requested);
      shopify.customerPrivacy = {
        setTrackingConsent(payload, done) {
          calls.push(payload);
          done({});
        },
      };
      cb();
    },
  };
  api.commitTrackingConsent(shopify, true);
  assert.deepEqual(features, [[{ name: 'consent-tracking-api', version: '0.1' }]]);
  assert.deepEqual(calls, [api.trackingConsentPayload(true)]);
  api.commitTrackingConsent(shopify, false);
  assert.deepEqual(calls[1], api.trackingConsentPayload(false));
});

test('a failed consent-tracking-api load does not grant analytics', () => {
  const calls = [];
  const shopify = {
    loadFeatures(_requested, cb) {
      shopify.customerPrivacy = {
        setTrackingConsent(payload) {
          calls.push(payload);
        },
      };
      cb(new Error('unavailable'));
    },
  };
  api.commitTrackingConsent(shopify, true);
  assert.deepEqual(calls, []);
});

test('a late accept callback does not overwrite a newer reject', () => {
  const calls = [];
  let pending = null;
  const shopify = {
    loadFeatures(_requested, cb) {
      pending = cb;
    },
  };
  const win = { Shopify: shopify, setTimeout() {} };
  const doc = fakeDoc();
  api.install(win, doc);
  doc.dispatch(clickTarget([
    { className: 'cookie-banner' },
    { tag: 'BUTTON', text: 'Zaakceptuj' },
  ]));
  shopify.customerPrivacy = {
    setTrackingConsent(payload, cb) {
      calls.push(payload);
      cb({});
    },
  };
  doc.dispatch(clickTarget([
    { className: 'cookie-banner' },
    { tag: 'BUTTON', text: 'Odrzuć' },
  ]));
  pending();
  assert.deepEqual(calls, [api.trackingConsentPayload(false)]);
});

test('non-boolean consent is not written', () => {
  const calls = [];
  api.commitTrackingConsent(
    {
      customerPrivacy: {
        setTrackingConsent(payload) {
          calls.push(payload);
        },
      },
    },
    'yes',
  );
  assert.deepEqual(calls, []);
});

test('theme bridge is what layout renders, and the app pixel stays analytics-gated', () => {
  const layout = fs.readFileSync(join(root, 'layout/theme.liquid'), 'utf8');
  const snippet = fs.readFileSync(join(root, 'snippets/epir-customer-privacy-consent.liquid'), 'utf8');
  const source = fs.readFileSync(join(root, 'assets/epir-customer-privacy-consent.js'), 'utf8');
  assert.match(layout, /render 'cookie-banner'/);
  assert.match(layout, /render 'epir-customer-privacy-consent'/);
  assert.match(snippet, /epir-customer-privacy-consent\.js/);
  assert.match(source, /setTrackingConsent/);
  assert.match(source, /consent-tracking-api/);
  assert.equal(source.includes('fetch('), false);
  assert.equal(source.includes('272171340'), false);

  const repo = join(root, '../..');
  const toml = fs.readFileSync(join(repo, 'extensions/my-web-pixel/shopify.extension.toml'), 'utf8');
  const pixel = fs.readFileSync(join(repo, 'extensions/my-web-pixel/src/index.ts'), 'utf8');
  assert.match(toml, /analytics\s*=\s*true/);
  assert.match(pixel, /analyticsProcessingAllowed === true/);
  assert.equal(toml.includes('272171340'), false);
});
