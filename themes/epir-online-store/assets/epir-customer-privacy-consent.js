/**
 * EPIR Online Store consent banner.
 *
 * The theme renders snippets/epir-customer-privacy-consent.liquid.
 * Buttons carry data-epir-consent="accept|reject". This file does not sniff
 * the Minimog cookie bar.
 *
 * Shopify Customer Privacy API (same method as CustomerPrivacyConsentBridge):
 *   Shopify.loadFeatures([{ name: 'consent-tracking-api', version: '0.1' }], cb)
 *   customerPrivacy.setTrackingConsent(payload, cb)
 *
 * Zaakceptuj: analytics, marketing, and preferences true; sale_of_data false.
 * Odrzuć: analytics, marketing, and preferences false; sale_of_data false.
 * Nothing is written on load. This file does not send pixel events.
 *
 * https://shopify.dev/docs/api/customer-privacy
 */
(function (root, factory) {
  var api = factory();
  if (typeof module === 'object' && module.exports) {
    module.exports = api;
  }
  if (typeof document !== 'undefined' && root && root.document) {
    api.install(root, root.document);
  }
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';

  var BANNER_ID = 'epir-customer-privacy-banner';
  var STORAGE_KEY = 'epir-customer-privacy-choice';

  function trackingConsentPayload(granted) {
    if (granted !== true && granted !== false) return null;
    return {
      analytics: granted,
      marketing: granted,
      preferences: granted,
      sale_of_data: false,
    };
  }

  function attr(el, name) {
    if (!el || typeof el.getAttribute !== 'function') return null;
    return el.getAttribute(name);
  }

  function parentOf(el) {
    if (!el) return null;
    if (el.parentElement) return el.parentElement;
    if (el.parentNode && el.parentNode !== el) return el.parentNode;
    return null;
  }

  function choiceFromTarget(banner, target) {
    var el = target;
    if (el && el.nodeType === 3) el = parentOf(el);
    while (el) {
      var value = attr(el, 'data-epir-consent');
      if (value === 'accept') return true;
      if (value === 'reject') return false;
      if (el === banner) return null;
      el = parentOf(el);
    }
    return null;
  }

  function storedChoice(storage) {
    if (!storage || typeof storage.getItem !== 'function') return null;
    var value = storage.getItem(STORAGE_KEY);
    if (value === 'accept') return true;
    if (value === 'reject') return false;
    return null;
  }

  function rememberChoice(storage, granted) {
    if (!storage || typeof storage.setItem !== 'function') return;
    storage.setItem(STORAGE_KEY, granted ? 'accept' : 'reject');
  }

  function hideBanner(banner) {
    if (!banner) return;
    banner.hidden = true;
    if (typeof banner.setAttribute === 'function') banner.setAttribute('hidden', '');
  }

  function showBanner(banner) {
    if (!banner) return;
    banner.hidden = false;
    if (typeof banner.removeAttribute === 'function') banner.removeAttribute('hidden');
  }

  function commitTrackingConsent(shopify, granted, options) {
    options = options || {};
    var payload = trackingConsentPayload(granted);
    if (!payload) return;
    function stale() {
      return typeof options.isStale === 'function' && options.isStale();
    }
    function write(customerPrivacy) {
      if (stale()) return;
      if (!customerPrivacy || typeof customerPrivacy.setTrackingConsent !== 'function') return;
      customerPrivacy.setTrackingConsent(payload, function (data) {
        if (typeof options.onResult === 'function') options.onResult(data);
      });
    }
    if (
      shopify &&
      shopify.customerPrivacy &&
      typeof shopify.customerPrivacy.setTrackingConsent === 'function'
    ) {
      write(shopify.customerPrivacy);
      return;
    }
    if (!shopify || typeof shopify.loadFeatures !== 'function') return;
    shopify.loadFeatures([{ name: 'consent-tracking-api', version: '0.1' }], function (error) {
      if (error || stale()) return;
      write(shopify.customerPrivacy);
    });
  }

  function install(win, doc, storage) {
    if (!win || !doc || typeof doc.getElementById !== 'function') return;
    if (typeof doc.addEventListener !== 'function') return;
    if (win.__epirCustomerPrivacyConsentInstalled) return;
    var banner = doc.getElementById(BANNER_ID);
    if (!banner) return;
    win.__epirCustomerPrivacyConsentInstalled = true;

    var store = storage || win.localStorage || null;
    if (storedChoice(store) === true || storedChoice(store) === false) {
      hideBanner(banner);
      return;
    }
    showBanner(banner);

    var generation = 0;
    var schedule = typeof win.setTimeout === 'function' ? win.setTimeout.bind(win) : function () {};

    doc.addEventListener(
      'click',
      function (event) {
        var granted = choiceFromTarget(banner, event && event.target);
        if (granted !== true && granted !== false) return;
        var token = ++generation;
        function isStale() {
          return token !== generation;
        }
        function attempt(n) {
          if (isStale()) return;
          var shopify = win.Shopify;
          if (!shopify) {
            if (n < 20) schedule(function () { attempt(n + 1); }, 150);
            return;
          }
          commitTrackingConsent(shopify, granted, {
            isStale: isStale,
            onResult: function () {
              if (isStale()) return;
              rememberChoice(store, granted);
              hideBanner(banner);
            },
          });
        }
        attempt(0);
      },
      true,
    );
  }

  return {
    BANNER_ID: BANNER_ID,
    STORAGE_KEY: STORAGE_KEY,
    trackingConsentPayload: trackingConsentPayload,
    commitTrackingConsent: commitTrackingConsent,
    install: install,
  };
});
