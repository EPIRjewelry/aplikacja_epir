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

function purposeInput(purpose, checked) {
  return {
    checked: checked === true,
    getAttribute(name) {
      return name === 'data-epir-purpose' ? purpose : null;
    },
  };
}

function bannerDoc() {
  const acceptAll = control('accept-all');
  const necessary = control('necessary');
  const customize = control('customize');
  const save = control('save');
  const analytics = purposeInput('analytics', true);
  const marketing = purposeInput('marketing', false);
  const preferences = purposeInput('preferences', true);
  const chat = purposeInput('chat', true);
  const purposes = { analytics, marketing, preferences, chat };
  const customizePanel = {
    hidden: true,
    querySelector(sel) {
      const match = /^\[data-epir-purpose="([^"]+)"\]$/.exec(sel);
      if (match) return purposes[match[1]] || null;
      return null;
    },
    setAttribute(name) {
      if (name === 'hidden') this.hidden = true;
    },
    removeAttribute(name) {
      if (name === 'hidden') this.hidden = false;
    },
  };
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
    querySelector(sel) {
      if (sel === '[data-epir-privacy-customize]') return customizePanel;
      return null;
    },
  };
  acceptAll.parentElement = banner;
  necessary.parentElement = banner;
  customize.parentElement = banner;
  save.parentElement = banner;
  const listeners = [];
  return {
    banner,
    acceptAll,
    necessary,
    customize,
    save,
    customizePanel,
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

test('Zaakceptuj wszystkie sets analytics, marketing, and preferences true and sale_of_data false', () => {
  assert.deepEqual(api.trackingConsentPayload(api.acceptAllDecision()), {
    analytics: true,
    marketing: true,
    preferences: true,
    sale_of_data: false,
  });
});

test('Zaakceptuj tylko niezbędne sets analytics, marketing, and preferences false and sale_of_data false', () => {
  assert.deepEqual(api.trackingConsentPayload(api.necessaryDecision()), {
    analytics: false,
    marketing: false,
    preferences: false,
    sale_of_data: false,
  });
  assert.equal(api.trackingConsentPayload(undefined), null);
  assert.equal(api.trackingConsentPayload(null), null);
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

test('a stored accept-all does not hide the banner until Shopify analytics is allowed', () => {
  const calls = [];
  const doc = bannerDoc();
  const storage = memoryStorage({ [api.STORAGE_KEY]: 'accept-all' });
  api.install({ Shopify: shopifyRecorder(calls), localStorage: storage }, doc);
  assert.deepEqual(calls, []);
  assert.equal(doc.banner.hidden, false);
  doc.dispatch(doc.acceptAll);
  assert.deepEqual(calls, [api.trackingConsentPayload(api.acceptAllDecision())]);
});

test('a stored accept-all hides when Shopify already allows analytics and does not rewrite consent', () => {
  const calls = [];
  const doc = bannerDoc();
  const storage = memoryStorage({ [api.STORAGE_KEY]: 'accept-all' });
  const shopify = shopifyRecorder(calls);
  shopify.customerPrivacy.analyticsProcessingAllowed = () => true;
  api.install({ Shopify: shopify, localStorage: storage }, doc);
  doc.dispatch(doc.acceptAll);
  assert.deepEqual(calls, []);
  assert.equal(doc.banner.hidden, true);
});

test('a stored accept-all hides when consent-tracking-api loads an existing analytics grant', () => {
  const calls = [];
  const doc = bannerDoc();
  const storage = memoryStorage({ [api.STORAGE_KEY]: 'accept-all' });
  const shopify = {
    loadFeatures(_requested, cb) {
      shopify.customerPrivacy = {
        setTrackingConsent(payload) {
          calls.push(payload);
        },
        analyticsProcessingAllowed() {
          return true;
        },
      };
      cb();
    },
  };
  api.install({ Shopify: shopify, localStorage: storage }, doc);
  assert.deepEqual(calls, []);
  assert.equal(doc.banner.hidden, true);
  doc.dispatch(doc.acceptAll);
  assert.deepEqual(calls, []);
});

test('a stored necessary choice hides the banner and does not grant analytics', () => {
  const calls = [];
  const doc = bannerDoc();
  const storage = memoryStorage({ [api.STORAGE_KEY]: 'necessary' });
  api.install({ Shopify: shopifyRecorder(calls), localStorage: storage }, doc);
  doc.dispatch(doc.acceptAll);
  assert.deepEqual(calls, []);
  assert.equal(doc.banner.hidden, true);
});

test('a setTrackingConsent error keeps the banner and does not store the choice', () => {
  const doc = bannerDoc();
  const storage = memoryStorage();
  const shopify = {
    customerPrivacy: {
      setTrackingConsent(_payload, cb) {
        cb({ error: 'region' });
      },
    },
  };
  api.install({ Shopify: shopify }, doc, storage);
  doc.dispatch(doc.acceptAll);
  assert.equal(storage.getItem(api.STORAGE_KEY), null);
  assert.equal(doc.banner.hidden, false);
});

test('Zaakceptuj wszystkie click writes the three purposes, chat flag, and hides the banner', () => {
  const calls = [];
  const events = [];
  const doc = bannerDoc();
  const storage = memoryStorage();
  api.install(
    {
      Shopify: shopifyRecorder(calls),
      CustomEvent: function CustomEvent(name, init) {
        this.type = name;
        this.detail = init && init.detail;
      },
      dispatchEvent(ev) {
        events.push(ev);
        return true;
      },
    },
    doc,
    storage,
  );
  doc.dispatch(doc.acceptAll);
  assert.deepEqual(calls, [api.trackingConsentPayload(api.acceptAllDecision())]);
  assert.equal(storage.getItem(api.STORAGE_KEY), 'accept-all');
  assert.equal(storage.getItem(api.CHAT_STORAGE_KEY), 'true');
  assert.equal(doc.banner.hidden, true);
  assert.equal(events.length, 1);
  assert.equal(events[0].type, api.EVENT_NAME);
  assert.equal(events[0].detail.chat, true);
});

test('Zaakceptuj tylko niezbędne click writes all three purposes false and blocks chat', () => {
  const calls = [];
  const doc = bannerDoc();
  const storage = memoryStorage();
  api.install({ Shopify: shopifyRecorder(calls) }, doc, storage);
  doc.dispatch(doc.necessary);
  assert.deepEqual(calls, [api.trackingConsentPayload(api.necessaryDecision())]);
  assert.equal(storage.getItem(api.STORAGE_KEY), 'necessary');
  assert.equal(storage.getItem(api.CHAT_STORAGE_KEY), 'false');
  assert.equal(doc.banner.hidden, true);
});

test('Dostosuj zgody toggles the customize panel without writing consent', () => {
  const calls = [];
  const doc = bannerDoc();
  api.install({ Shopify: shopifyRecorder(calls) }, doc, memoryStorage());
  doc.dispatch(doc.customize);
  assert.equal(doc.customizePanel.hidden, false);
  assert.deepEqual(calls, []);
  assert.equal(doc.banner.hidden, false);
});

test('Zapisz wybór writes selected purposes from the customize panel', () => {
  const calls = [];
  const doc = bannerDoc();
  const storage = memoryStorage();
  api.install({ Shopify: shopifyRecorder(calls) }, doc, storage);
  doc.dispatch(doc.save);
  assert.deepEqual(calls, [
    {
      analytics: true,
      marketing: false,
      preferences: true,
      sale_of_data: false,
    },
  ]);
  assert.equal(storage.getItem(api.STORAGE_KEY), 'custom');
  assert.equal(storage.getItem(api.CHAT_STORAGE_KEY), 'true');
});

test('a Zaakceptuj wszystkie button outside this banner does not grant consent', () => {
  const calls = [];
  const doc = bannerDoc();
  api.install({ Shopify: shopifyRecorder(calls) }, doc, memoryStorage());
  doc.dispatch({
    parentElement: null,
    getAttribute() {
      return null;
    },
    textContent: 'Zaakceptuj wszystkie',
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
  api.commitTrackingConsent(shopify, api.acceptAllDecision());
  assert.deepEqual(features, [[{ name: 'consent-tracking-api', version: '0.1' }]]);
  assert.deepEqual(calls, [api.trackingConsentPayload(api.acceptAllDecision())]);
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
  api.commitTrackingConsent(shopify, api.acceptAllDecision());
  assert.deepEqual(calls, []);
});

test('a late accept-all callback does not overwrite a newer necessary choice', () => {
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
  doc.dispatch(doc.acceptAll);
  shopify.customerPrivacy = {
    setTrackingConsent(payload, cb) {
      calls.push(payload);
      cb({});
    },
  };
  doc.dispatch(doc.necessary);
  pending();
  assert.deepEqual(calls, [api.trackingConsentPayload(api.necessaryDecision())]);
  assert.equal(storage.getItem(api.STORAGE_KEY), 'necessary');
  assert.equal(storage.getItem(api.CHAT_STORAGE_KEY), 'false');
});

test('the theme renders this Polish banner and does not render the Minimog cookie bar', () => {
  const layout = fs.readFileSync(join(root, 'layout/theme.liquid'), 'utf8');
  const snippet = fs.readFileSync(join(root, 'snippets/epir-customer-privacy-consent.liquid'), 'utf8');
  const source = fs.readFileSync(join(root, 'assets/epir-customer-privacy-consent.js'), 'utf8');
  const banner = snippet.slice(snippet.indexOf('<div'));

  assert.match(layout, /render 'epir-customer-privacy-consent'/);
  assert.doesNotMatch(layout, /\{%\s*render\s+'cookie-banner'\s*%\}/);
  assert.match(banner, /Dbamy o Twoją prywatność/);
  assert.match(banner, /rozmowy z doradcą w czacie/);
  assert.match(banner, /\/pages\/polityka-cookies/);
  assert.match(banner, /Analityczne \(wizyty\)/);
  assert.match(banner, /Marketingowe \(reklamy\)/);
  assert.match(banner, /Preferencje/);
  assert.match(banner, /Rozmowa z doradcą w czacie/);
  assert.match(banner, /data-epir-consent="accept-all"/);
  assert.match(banner, /data-epir-consent="necessary"/);
  assert.match(banner, /data-epir-consent="customize"/);
  assert.match(banner, />Zaakceptuj wszystkie</);
  assert.match(banner, />Zaakceptuj tylko niezbędne</);
  assert.match(banner, />Dostosuj zgody</);
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
