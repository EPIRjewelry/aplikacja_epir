/**
 * EPIR Online Store — Customer Privacy consent bridge.
 *
 * The live theme renders {% render 'cookie-banner' %} (vendor snippet, not in
 * this repo). That banner does not call Shopify's Customer Privacy API, so
 * analyticsProcessingAllowed stays false and the app web pixel (analytics = true)
 * never loads.
 *
 * One click records analytics only. The app pixel needs analytics = true.
 * Marketing, preferences, and sale_of_data stay false on both accept and reject.
 *   customerPrivacy.setTrackingConsent({
 *     analytics: granted,
 *     marketing: false,
 *     preferences: false,
 *     sale_of_data: false,
 *   }, cb)
 * after Shopify.loadFeatures([{ name: 'consent-tracking-api', version: '0.1' }])
 * when the API is not on the page yet.
 *
 * Accept sets analytics true. Reject sets analytics false and does not grant the other three.
 * No call is made on load, and this file does not send pixel events.
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

  var ACCEPT_ATTRS = [
    'data-cookie-accept',
    'data-accept-cookie',
    'data-consent-accept',
    'data-accept-button',
    'data-cookie-consent-accept',
  ];
  var REJECT_ATTRS = [
    'data-cookie-decline',
    'data-decline-cookie',
    'data-consent-decline',
    'data-decline-button',
    'data-cookie-reject',
    'data-reject-cookie',
    'data-reject-button',
  ];
  var ACCEPT_MARKERS = [
    'btn-accept',
    'accept-all',
    'cookie-accept',
    'consent-accept',
    'banner__accept',
    'accept-button',
  ];
  var REJECT_MARKERS = [
    'btn-decline',
    'btn-reject',
    'decline-all',
    'reject-all',
    'cookie-decline',
    'cookie-reject',
    'consent-decline',
    'consent-reject',
    'banner__decline',
    'banner__reject',
    'decline-button',
    'reject-button',
  ];
  var ACCEPT_EXACT = [
    'zaakceptuj',
    'akceptuje',
    'zgadzam sie',
    'zezwol',
    'accept',
    'allow',
    'i agree',
    'accept all',
    'allow all',
  ];
  var ACCEPT_PREFIX = ['zaakceptuj ', 'akceptuje ', 'accept all', 'allow all', 'accept '];
  var REJECT_EXACT = [
    'odrzuc',
    'odmow',
    'nie zgadzam sie',
    'nie akceptuje',
    'decline',
    'reject',
    'deny',
    'decline all',
    'reject all',
  ];
  var BANNER_RE = /cookie|consent|ciastecz|gdpr|shopify-pc|privacy-banner|privacy_banner/;

  function trackingConsentPayload(granted) {
    if (granted !== true && granted !== false) return null;
    return {
      analytics: granted,
      marketing: false,
      preferences: false,
      sale_of_data: false,
    };
  }

  function fold(value) {
    return String(value || '')
      .replace(/\s+/g, ' ')
      .trim()
      .toLowerCase()
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '');
  }

  function attr(el, name) {
    if (!el) return null;
    if (typeof el.getAttribute === 'function') return el.getAttribute(name);
    if (el.attributes && Object.prototype.hasOwnProperty.call(el.attributes, name)) {
      return el.attributes[name];
    }
    return null;
  }

  function hasAnyAttr(el, names) {
    for (var i = 0; i < names.length; i++) {
      if (attr(el, names[i]) !== null) return true;
    }
    return false;
  }

  function classNameOf(el) {
    if (!el || el.className == null) return '';
    if (typeof el.className === 'string') return el.className;
    if (typeof el.className.baseVal === 'string') return el.className.baseVal;
    return '';
  }

  function hasMarker(blob, marker) {
    return new RegExp('(?:^|[^a-z0-9])' + marker + '(?:$|[^a-z0-9])').test(blob);
  }

  function markerDecision(blob) {
    var accept = false;
    var reject = false;
    var i;
    for (i = 0; i < ACCEPT_MARKERS.length; i++) {
      if (hasMarker(blob, ACCEPT_MARKERS[i])) accept = true;
    }
    for (i = 0; i < REJECT_MARKERS.length; i++) {
      if (hasMarker(blob, REJECT_MARKERS[i])) reject = true;
    }
    return { accept: accept, reject: reject };
  }

  function parentOf(el) {
    if (!el) return null;
    if (el.parentElement) return el.parentElement;
    if (el.parentNode && el.parentNode !== el) return el.parentNode;
    return null;
  }

  function isBannerEl(el) {
    if (!el) return false;
    var tag = String(el.tagName || '').toLowerCase();
    if (tag === 'body' || tag === 'html') return false;
    if (tag === 'cookie-banner' || tag === 'm-cookie-banner') return true;
    if (attr(el, 'data-cookie-banner') !== null || attr(el, 'data-consent-banner') !== null) return true;
    var blob = tag + ' ' + String(el.id || '').toLowerCase() + ' ' + classNameOf(el).toLowerCase();
    return BANNER_RE.test(blob);
  }

  function directText(el) {
    if (typeof el.directText === 'string') return el.directText;
    var nodes = el.childNodes || [];
    if (!nodes.length) return el.textContent || el.innerText || '';
    var parts = [];
    for (var i = 0; i < nodes.length; i++) {
      if (nodes[i] && nodes[i].nodeType === 3) parts.push(nodes[i].textContent || '');
    }
    return parts.join(' ');
  }

  function isLeafControl(el) {
    var tag = String(el.tagName || '').toLowerCase();
    if (tag === 'button' || tag === 'a' || tag === 'input') return true;
    if (attr(el, 'role') === 'button') return true;
    if (classNameOf(el).toLowerCase().indexOf('m-button') !== -1) return true;
    return false;
  }

  function labelOf(el) {
    var direct = fold(directText(el));
    if (direct) return direct;
    var aria = fold(attr(el, 'aria-label'));
    if (aria) return aria;
    var value = fold(attr(el, 'value'));
    if (value) return value;
    var title = fold(attr(el, 'title'));
    if (title) return title;
    if (isLeafControl(el)) return fold(el.textContent || el.innerText || '');
    return '';
  }

  function matchesLabel(folded, exact, prefixes) {
    if (!folded || folded.length > 64) return false;
    var i;
    for (i = 0; i < exact.length; i++) {
      if (folded === exact[i]) return true;
    }
    for (i = 0; i < prefixes.length; i++) {
      if (folded.indexOf(prefixes[i]) === 0) return true;
    }
    return false;
  }

  function containsPhrase(folded, phrase) {
    var from = 0;
    while (from < folded.length) {
      var at = folded.indexOf(phrase, from);
      if (at < 0) return false;
      var beforeOk = at === 0 || folded.charAt(at - 1) === ' ';
      var after = at + phrase.length;
      var afterOk = after === folded.length || folded.charAt(after) === ' ';
      if (beforeOk && afterOk) return true;
      from = at + 1;
    }
    return false;
  }

  /**
   * A control that names both choices ("Zaakceptuj Odrzuć") is not a decision.
   * Reject phrases are removed first so "nie akceptuję" stays a reject.
   */
  function labelSignals(label) {
    if (!label || label.length > 64) return { accept: false, reject: false };
    var reject = false;
    var remainder = label;
    var i;
    for (i = 0; i < REJECT_EXACT.length; i++) {
      if (containsPhrase(label, REJECT_EXACT[i])) reject = true;
      remainder = remainder.split(REJECT_EXACT[i]).join(' ');
    }
    remainder = remainder.replace(/\s+/g, ' ').trim();
    var accept = matchesLabel(remainder, ACCEPT_EXACT, ACCEPT_PREFIX);
    return { accept: accept, reject: reject };
  }

  function decisionFromControl(el) {
    if (!el) return null;
    var explicit = attr(el, 'data-epir-consent');
    if (explicit === 'accept') return true;
    if (explicit === 'reject') return false;

    var accept = hasAnyAttr(el, ACCEPT_ATTRS);
    var reject = hasAnyAttr(el, REJECT_ATTRS);
    var blob = (String(el.id || '') + ' ' + classNameOf(el)).toLowerCase();
    var markers = markerDecision(blob);
    if (markers.accept) accept = true;
    if (markers.reject) reject = true;
    var signals = labelSignals(labelOf(el));
    if (signals.accept) accept = true;
    if (signals.reject) reject = true;
    if (accept === reject) return null;
    return accept;
  }

  function asElement(node) {
    if (!node) return null;
    if (node.nodeType === 3) return node.parentElement || node.parentNode || null;
    return node;
  }

  /** @returns {boolean|null} true accept, false reject, null not a banner decision */
  function decisionFromClick(target) {
    var start = asElement(target);
    var chain = [];
    var banner = null;
    for (var el = start; el; el = parentOf(el)) {
      chain.push(el);
      if (isBannerEl(el)) {
        banner = el;
        break;
      }
    }
    if (!banner) return null;
    for (var i = 0; i < chain.length; i++) {
      var decision = decisionFromControl(chain[i]);
      if (decision === true || decision === false) return decision;
    }
    return null;
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

  function install(win, doc) {
    if (!win || !doc || typeof doc.addEventListener !== 'function') return;
    if (win.__epirCustomerPrivacyConsentInstalled) return;
    win.__epirCustomerPrivacyConsentInstalled = true;
    var generation = 0;
    var schedule = typeof win.setTimeout === 'function' ? win.setTimeout.bind(win) : function () {};

    doc.addEventListener(
      'click',
      function (event) {
        var granted = decisionFromClick(event && event.target);
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
          commitTrackingConsent(shopify, granted, { isStale: isStale });
        }
        attempt(0);
      },
      true,
    );
  }

  return {
    trackingConsentPayload: trackingConsentPayload,
    decisionFromClick: decisionFromClick,
    commitTrackingConsent: commitTrackingConsent,
    install: install,
  };
});
