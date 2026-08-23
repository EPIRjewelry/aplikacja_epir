/**
 * EPIR - InPost Geowidget: save pickup point to cart attributes + gate checkout.
 */
(function () {
  'use strict';

  var ATTR_CODE = 'InPost Paczkomat';
  var ATTR_ADDRESS = 'InPost adres';
  var ATTR_NAME = 'InPost nazwa';

  function formatAddress(point) {
    if (!point) return '';
    var a = point.address;
    if (typeof a === 'string') return a;
    if (a && typeof a === 'object') {
      var parts = [a.line1 || a.street || '', a.line2 || '', a.post_code || a.postcode || '', a.city || '']
        .map(function (p) { return String(p || '').trim(); })
        .filter(Boolean);
      return parts.join(', ');
    }
    return point.location_description || '';
  }

  function pointCode(point) {
    if (!point) return '';
    return String(point.name || point.id || '').trim();
  }

  function cartUpdateUrl() {
    if (window.Shopify && window.Shopify.routes && window.Shopify.routes.root) {
      return window.Shopify.routes.root + 'cart/update.js';
    }
    return '/cart/update.js';
  }

  function updateCheckoutButtons() {
    // Safety: keep checkout unblocked. InPost selection is auxiliary cart metadata only.
    return;
  }

  function setSummary(root, code, address) {
    var summary = root.querySelector('[data-epir-inpost-summary]');
    var codeEl = root.querySelector('[data-epir-inpost-code]');
    var addrEl = root.querySelector('[data-epir-inpost-address]');
    var mapWrap = root.querySelector('[data-epir-inpost-map]');
    if (!summary) return;

    if (code) {
      summary.hidden = false;
      if (codeEl) codeEl.textContent = code;
      if (addrEl) {
        addrEl.textContent = address || '';
        addrEl.hidden = !address;
      }
      if (mapWrap) mapWrap.hidden = true;
    } else {
      summary.hidden = true;
      if (mapWrap) mapWrap.hidden = false;
    }
  }

  function postAttributes(attrs) {
    return fetch(cartUpdateUrl(), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
      body: JSON.stringify({ attributes: attrs }),
      credentials: 'same-origin'
    }).then(function (res) {
      if (!res.ok) throw new Error('cart/update failed');
      return res.json();
    });
  }

  function savePoint(point) {
    var code = pointCode(point);
    var address = formatAddress(point);
    var displayName = point && (point.location_description || point.address_details || code);
    var attrs = {};
    attrs[ATTR_CODE] = code;
    attrs[ATTR_ADDRESS] = address;
    attrs[ATTR_NAME] = String(displayName || code);
    return postAttributes(attrs);
  }

  function clearPoint() {
    var attrs = {};
    attrs[ATTR_CODE] = '';
    attrs[ATTR_ADDRESS] = '';
    attrs[ATTR_NAME] = '';
    return postAttributes(attrs);
  }

  function onPointSelected(point, root) {
    var code = pointCode(point);
    if (!code) return;
    root.classList.add('epir-inpost--saving');
    savePoint(point)
      .then(function () {
        setSummary(root, code, formatAddress(point));
        updateCheckoutButtons(true);
        root.classList.remove('epir-inpost--saving');
        root.classList.add('epir-inpost--selected');
      })
      .catch(function () {
        root.classList.remove('epir-inpost--saving');
        root.classList.add('epir-inpost--error');
      });
  }

  function bindToggle(root) {
    var toggle = root && root.parentElement ? root.parentElement.querySelector('[data-epir-inpost-toggle]') : null;
    if (!toggle || toggle.dataset.epirInpostBound === '1') return;

    toggle.dataset.epirInpostBound = '1';

    var initialCode = (root.dataset.epirInpostInitialCode || '').trim();
    toggle.checked = !!initialCode;
    root.hidden = !toggle.checked;

    if (toggle.checked) {
      var mapWrap = root.querySelector('[data-epir-inpost-map]');
      if (mapWrap) mapWrap.hidden = !!initialCode;
    }

    toggle.addEventListener('change', function () {
      if (toggle.checked) {
        root.hidden = false;
        var mapWrap = root.querySelector('[data-epir-inpost-map]');
        if (mapWrap) mapWrap.hidden = !!(root.dataset.epirInpostInitialCode || '').trim();
      } else {
        root.hidden = true;
        var mapWrap = root.querySelector('[data-epir-inpost-map]');
        if (mapWrap) mapWrap.hidden = true;
      }
    });
  }

  function bindRoot(root) {
    if (!root || root.dataset.epirInpostBound === '1') return;
    root.dataset.epirInpostBound = '1';

    var initialCode = root.dataset.epirInpostInitialCode || '';
    var initialAddress = root.dataset.epirInpostInitialAddress || '';
    if (initialCode) {
      setSummary(root, initialCode, initialAddress);
      updateCheckoutButtons(true);
      root.classList.add('epir-inpost--selected');
    } else {
      updateCheckoutButtons(false);
    }

    bindToggle(root);

    var changeBtn = root.querySelector('[data-epir-inpost-change]');
    if (changeBtn) {
      changeBtn.addEventListener('click', function () {
        root.classList.add('epir-inpost--saving');
        clearPoint()
          .then(function () {
            setSummary(root, '', '');
            updateCheckoutButtons(false);
            root.classList.remove('epir-inpost--selected', 'epir-inpost--saving');
            var mapWrap = root.querySelector('[data-epir-inpost-map]');
            if (mapWrap) mapWrap.hidden = false;
          })
          .catch(function () {
            root.classList.remove('epir-inpost--saving');
          });
      });
    }

    var widget = root.querySelector('inpost-geowidget');
    if (widget) {
      widget.addEventListener('onpointselect', function (event) {
        var point = (event && event.detail) || (event && event.details) || null;
        if (point) onPointSelected(point, root);
      });
    }
  }

  window.epirInpostPointSelect = function (point) {
    var roots = document.querySelectorAll('[data-epir-inpost-root]');
    var visible = null;
    roots.forEach(function (r) {
      if (r.offsetParent !== null || r.getClientRects().length) visible = r;
    });
    if (!visible && roots.length) visible = roots[0];
    if (visible) onPointSelected(point, visible);
  };

  function ensureAssets(done) {
    if (window.__epirInpostGeoAssetsReady) {
      if (done) done();
      return;
    }
    if (window.__epirInpostGeoAssetsLoading) {
      window.__epirInpostGeoAssetsLoading.push(done || function () {});
      return;
    }
    window.__epirInpostGeoAssetsLoading = [done || function () {}];

    function finish() {
      window.__epirInpostGeoAssetsReady = true;
      var cbs = window.__epirInpostGeoAssetsLoading || [];
      window.__epirInpostGeoAssetsLoading = null;
      cbs.forEach(function (cb) { try { cb(); } catch (e) {} });
    }

    if (!document.querySelector('link[data-epir-inpost-geo-css]')) {
      var link = document.createElement('link');
      link.rel = 'stylesheet';
      link.href = 'https://geowidget.inpost.pl/inpost-geowidget.css';
      link.setAttribute('data-epir-inpost-geo-css', '1');
      document.head.appendChild(link);
    }

    if (window.customElements && window.customElements.get('inpost-geowidget')) {
      finish();
      return;
    }

    var existing = document.querySelector('script[data-epir-inpost-geo-js]');
    if (existing) {
      existing.addEventListener('load', finish);
      return;
    }

    var geo = document.createElement('script');
    geo.src = 'https://geowidget.inpost.pl/inpost-geowidget.js';
    geo.defer = true;
    geo.setAttribute('data-epir-inpost-geo-js', '1');
    geo.addEventListener('load', finish);
    geo.addEventListener('error', finish);
    document.head.appendChild(geo);
  }

  function initAll() {
    document.querySelectorAll('[data-epir-inpost-root]').forEach(function (root) {
      root.dataset.epirInpostBound = '';
      bindRoot(root);
    });
  }

  window.epirInpostAfterCartDom = function () {
    ensureAssets(function () {
      initAll();
    });
  };

  function boot() {
    ensureAssets(function () {
      initAll();
    });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', boot);
  } else {
    boot();
  }

  document.addEventListener('cart:updated', window.epirInpostAfterCartDom);
  document.addEventListener('minimog:cart:updated', window.epirInpostAfterCartDom);
})();


