import assert from 'node:assert/strict';
import fs from 'node:fs';
import { dirname, join } from 'node:path';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';

const root = dirname(fileURLToPath(import.meta.url));
const require = createRequire(import.meta.url);
const api = require('./assets/epir-customer-privacy-consent.js');

function memoryStorage(initial) {
  const data = Object.assign({}, initial);
  return {
    getItem(key) {
      return Object.prototype.hasOwnProperty.call(data, key) ? data[key] : null;
    },
    setItem(key, value) {
      data[key] = String(value);
    },
  };
}

function control(value) {
  return {
    nodeType: 1,
    tagName: 'BUTTON',
    getAttribute(name) {
      return name === 'data-epir-consent' ? value : null;
    },
  };
}

function bannerDoc() {
  const accept = control('accept');
  const reject = control('reject');
  const banner = {
    id: api.BANNER_ID,
    hidden: false,
    getAttribute(name) {
      return name === 'data-epir-privacy-banner' ? '' : null;
    },
    setAttribute(name) {
      if (name === 'hidden') this.hidden = true;
    },
    removeAttribute(name) {
      if (name === 'hidden') this.hidden = false;
    },
  };
  accept.parentElement = banner;
  reject.parentElement = banner;
  const listeners = [];
  return {
    banner,
    accept,
    reject,
    getElementById(id) {
      return id === banner.id ? banner : null;
    },
    addEventListener(type, fn) {
      assert.equal(type, 'click');
      listeners.push(fn);
    },
    dispatch(target) {
      for (const fn of listeners) fn({ target });
    },
  };
}

function shopifyRecorder(calls) {
  return {
    customerPrivacy: {
      setTrackingConsent(payload, cb) {
        calls.push(payload);
        if (cb) cb({});
      },
    },
  };
}

test('Zaakceptuj sets analytics, marketing, and preferences true and sale_of_data false', () => {
  assert.deepEqual(api.trackingConsentPayload(true), {
    analytics: true,
    marketing: true,
    preferences: true,
    sale_of_data: false,
  });
});

test('Odrzuć sets analytics, marketing, and preferences false and sale_of_data false', () => {
  assert.deepEqual(api.trackingConsentPayload(false), {
    analytics: false,
    marketing: false,
    preferences: false,
    sale_of_data: false,
  });
  assert.equal(api.trackingConsentPayload(undefined), null);
  assert.equal(api.trackingConsentPayload(null), null);
  assert.equal(api.trackingConsentPayload('true'), null);
});

test('install does not call setTrackingConsent and leaves the banner visible', () => {
  const calls = [];
  const doc = bannerDoc();
  api.install(
    { Shopify: shopifyRecorder(calls), localStorage: memoryStorage() },
    doc,
  );
  assert.deepEqual(calls, []);
  assert.equal(doc.banner.hidden, false);
});

test('a stored choice hides the banner and still does not write consent on load', () => {
  const calls = [];
  const doc = bannerDoc();
  const storage = memoryStorage({ [api.STORAGE_KEY]: 'accept' });
  api.install({ Shopify: shopifyRecorder(calls), localStorage: storage }, doc);
  doc.dispatch(doc.accept);
  assert.deepEqual(calls, []);
  assert.equal(doc.banner.hidden, true);
});

test('Zaakceptuj click writes the three purposes and hides the banner', () => {
  const calls = [];
  const doc = bannerDoc();
  const storage = memoryStorage();
  api.install({ Shopify: shopifyRecorder(calls) }, doc, storage);
  doc.dispatch(doc.accept);
  assert.deepEqual(calls, [api.trackingConsentPayload(true)]);
  assert.equal(storage.getItem(api.STORAGE_KEY), 'accept');
  assert.equal(doc.banner.hidden, true);
});

test('Odrzuć click writes all three purposes false and sale_of_data false', () => {
  const calls = [];
  const doc = bannerDoc();
  const storage = memoryStorage();
  api.install({ Shopify: shopifyRecorder(calls) }, doc, storage);
  doc.dispatch(doc.reject);
  assert.deepEqual(calls, [api.trackingConsentPayload(false)]);
  assert.equal(calls[0].analytics, false);
  assert.equal(calls[0].marketing, false);
  assert.equal(calls[0].preferences, false);
  assert.equal(calls[0].sale_of_data, false);
  assert.equal(storage.getItem(api.STORAGE_KEY), 'reject');
  assert.equal(doc.banner.hidden, true);
});

test('a Zaakceptuj button outside this banner does not grant consent', () => {
  const calls = [];
  const doc = bannerDoc();
  api.install({ Shopify: shopifyRecorder(calls) }, doc, memoryStorage());
  doc.dispatch({
    parentElement: null,
    getAttribute() {
      return null;
    },
    textContent: 'Zaakceptuj',
  });
  assert.deepEqual(calls, []);
  assert.equal(doc.banner.hidden, false);
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
});

test('a failed consent-tracking-api load does not grant consent', () => {
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
  const doc = bannerDoc();
  const storage = memoryStorage();
  api.install({ Shopify: shopify, setTimeout() {} }, doc, storage);
  doc.dispatch(doc.accept);
  shopify.customerPrivacy = {
    setTrackingConsent(payload, cb) {
      calls.push(payload);
      cb({});
    },
  };
  doc.dispatch(doc.reject);
  pending();
  assert.deepEqual(calls, [api.trackingConsentPayload(false)]);
  assert.equal(storage.getItem(api.STORAGE_KEY), 'reject');
});

test('the theme renders this Polish banner and does not render the Minimog cookie bar', () => {
  const layout = fs.readFileSync(join(root, 'layout/theme.liquid'), 'utf8');
  const snippet = fs.readFileSync(join(root, 'snippets/epir-customer-privacy-consent.liquid'), 'utf8');
  const source = fs.readFileSync(join(root, 'assets/epir-customer-privacy-consent.js'), 'utf8');
  const banner = snippet.slice(snippet.indexOf('<div'));

  assert.match(layout, /render 'epir-customer-privacy-consent'/);
  assert.doesNotMatch(layout, /\{%\s*render\s+'cookie-banner'\s*%\}/);
  assert.match(banner, /analityka \(wizyty\)/);
  assert.match(banner, /marketing \(reklamy i remarketing\)/);
  assert.match(banner, /preferencje/);
  assert.match(banner, /data-epir-consent="accept"/);
  assert.match(banner, /data-epir-consent="reject"/);
  assert.match(banner, />Zaakceptuj</);
  assert.match(banner, />Odrzuć</);
  assert.doesNotMatch(banner, /sale of data|sale_of_data|sprzedaż danych|sprzedaz danych/i);
  assert.match(source, /setTrackingConsent/);
  assert.match(source, /consent-tracking-api/);
  assert.match(source, /sale_of_data:\s*false/);
  assert.doesNotMatch(source, /sale_of_data:\s*true/);
  assert.equal(source.includes('fetch('), false);
  assert.equal(source.includes('272171340'), false);
  assert.equal(source.includes('shopify-pc'), false);

  const repo = join(root, '../..');
  const toml = fs.readFileSync(join(repo, 'extensions/my-web-pixel/shopify.extension.toml'), 'utf8');
  const pixel = fs.readFileSync(join(repo, 'extensions/my-web-pixel/src/index.ts'), 'utf8');
  assert.match(toml, /analytics\s*=\s*true/);
  assert.match(pixel, /analyticsProcessingAllowed === true/);
});
