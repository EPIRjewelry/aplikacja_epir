/**
 * EPIR Online Store consent banner.
 *
 * The theme renders snippets/epir-customer-privacy-consent.liquid.
 * Buttons: accept-all | necessary | customize | save.
 * Nothing is written on load. This file does not send pixel events.
 *
 * Shopify Customer Privacy API:
 *   Shopify.loadFeatures([{ name: 'consent-tracking-api', version: '0.1' }], cb)
 *   customerPrivacy.setTrackingConsent(payload, cb)
 *
 * Chat unlock is signaled via localStorage + CustomEvent for the assistant gate.
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
  var CHAT_STORAGE_KEY = 'epir-customer-privacy-chat';
  var EVENT_NAME = 'epir-customer-privacy-consent';

  function trackingConsentPayload(partial) {
    if (!partial || typeof partial !== 'object') return null;
    return {
      analytics: partial.analytics === true,
      marketing: partial.marketing === true,
      preferences: partial.preferences === true,
      sale_of_data: false,
    };
  }

  function acceptAllDecision() {
    return {
      choice: 'accept-all',
      analytics: true,
      marketing: true,
      preferences: true,
      chat: true,
    };
  }

  function necessaryDecision() {
    return {
      choice: 'necessary',
      analytics: false,
      marketing: false,
      preferences: false,
      chat: false,
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

  function actionFromTarget(banner, target) {
    var el = target;
    if (el && el.nodeType === 3) el = parentOf(el);
    while (el) {
      var value = attr(el, 'data-epir-consent');
      if (
        value === 'accept-all' ||
        value === 'necessary' ||
        value === 'customize' ||
        value === 'save'
      ) {
        return value;
      }
      if (el === banner) return null;
      el = parentOf(el);
    }
    return null;
  }

  function storedChoice(storage) {
    if (!storage || typeof storage.getItem !== 'function') return null;
    var value = storage.getItem(STORAGE_KEY);
    if (value === 'accept-all' || value === 'accept') return 'accept-all';
    if (value === 'necessary' || value === 'reject') return 'necessary';
    if (value === 'custom') return 'custom';
    return null;
  }

  function rememberDecision(storage, decision) {
    if (!storage || typeof storage.setItem !== 'function' || !decision) return;
    storage.setItem(STORAGE_KEY, decision.choice);
    storage.setItem(CHAT_STORAGE_KEY, decision.chat === true ? 'true' : 'false');
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

  function customizePanel(banner) {
    if (!banner || typeof banner.querySelector !== 'function') return null;
    return banner.querySelector('[data-epir-privacy-customize]');
  }

  function toggleCustomize(banner) {
    var panel = customizePanel(banner);
    if (!panel) return;
    if (panel.hidden) {
      panel.hidden = false;
      if (typeof panel.removeAttribute === 'function') panel.removeAttribute('hidden');
    } else {
      panel.hidden = true;
      if (typeof panel.setAttribute === 'function') panel.setAttribute('hidden', '');
    }
  }

  function decisionFromCustomize(banner) {
    var panel = customizePanel(banner);
    if (!panel || typeof panel.querySelector !== 'function') return necessaryDecision();
    function checked(purpose) {
      var input = panel.querySelector('[data-epir-purpose="' + purpose + '"]');
      return !!(input && input.checked);
    }
    return {
      choice: 'custom',
      analytics: checked('analytics'),
      marketing: checked('marketing'),
      preferences: checked('preferences'),
      chat: checked('chat'),
    };
  }

  function announceDecision(win, decision) {
    if (!win || !decision) return;
    try {
      if (typeof win.dispatchEvent === 'function' && typeof win.CustomEvent === 'function') {
        win.dispatchEvent(
          new win.CustomEvent(EVENT_NAME, {
            detail: {
              choice: decision.choice,
              analytics: decision.analytics === true,
              marketing: decision.marketing === true,
              preferences: decision.preferences === true,
              chat: decision.chat === true,
            },
          }),
        );
      }
    } catch (e) {}
  }

  function commitTrackingConsent(shopify, decision, options) {
    options = options || {};
    var payload = trackingConsentPayload(decision);
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

  function applyDecision(win, banner, storage, decision, options) {
    options = options || {};
    var token = options.token;
    var generation = options.generation;
    function isStale() {
      return typeof generation === 'object' && token !== generation.current;
    }
    var schedule = typeof win.setTimeout === 'function' ? win.setTimeout.bind(win) : function () {};
    function attempt(n) {
      if (isStale()) return;
      var shopify = win.Shopify;
      if (!shopify) {
        if (n < 20) schedule(function () { attempt(n + 1); }, 150);
        return;
      }
      commitTrackingConsent(shopify, decision, {
        isStale: isStale,
        onResult: function () {
          if (isStale()) return;
          rememberDecision(storage, decision);
          announceDecision(win, decision);
          hideBanner(banner);
        },
      });
    }
    attempt(0);
  }

  function install(win, doc, storage) {
    if (!win || !doc || typeof doc.getElementById !== 'function') return;
    if (typeof doc.addEventListener !== 'function') return;
    if (win.__epirCustomerPrivacyConsentInstalled) return;
    var banner = doc.getElementById(BANNER_ID);
    if (!banner) return;
    win.__epirCustomerPrivacyConsentInstalled = true;

    var store = storage || win.localStorage || null;
    if (storedChoice(store)) {
      hideBanner(banner);
      return;
    }
    showBanner(banner);

    var generation = { current: 0 };

    doc.addEventListener(
      'click',
      function (event) {
        var action = actionFromTarget(banner, event && event.target);
        if (!action) return;
        if (action === 'customize') {
          toggleCustomize(banner);
          return;
        }
        var decision =
          action === 'accept-all'
            ? acceptAllDecision()
            : action === 'necessary'
              ? necessaryDecision()
              : action === 'save'
                ? decisionFromCustomize(banner)
                : null;
        if (!decision) return;
        var token = ++generation.current;
        applyDecision(win, banner, store, decision, { token: token, generation: generation });
      },
      true,
    );
  }

  return {
    BANNER_ID: BANNER_ID,
    STORAGE_KEY: STORAGE_KEY,
    CHAT_STORAGE_KEY: CHAT_STORAGE_KEY,
    EVENT_NAME: EVENT_NAME,
    trackingConsentPayload: trackingConsentPayload,
    acceptAllDecision: acceptAllDecision,
    necessaryDecision: necessaryDecision,
    commitTrackingConsent: commitTrackingConsent,
    install: install,
  };
});
