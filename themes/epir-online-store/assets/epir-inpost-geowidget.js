/**
 * EPIR - InPost Geowidget: save pickup point to cart attributes (Leaflet, no custom elements).
 * Compatible with Chrome, Firefox, Safari, Edge, mobile browsers.
 */
(function () {
  'use strict';

  var ATTR_CODE = 'InPost Paczkomat';
  var ATTR_ADDRESS = 'InPost adres';
  var ATTR_NAME = 'InPost nazwa';
  var WORKER_URL = 'https://epir-inpost-proxy-production.krzysztofdzugaj.workers.dev';

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

  function showError(root, msg) {
    var errorEl = root.querySelector('[data-epir-inpost-error]');
    if (errorEl) {
      errorEl.textContent = msg || 'Nie udalo sie zaladowac punktow.';
      errorEl.hidden = false;
    }
    root.classList.add('epir-inpost--error');
  }

  function hideError(root) {
    root.classList.remove('epir-inpost--error');
    var errorEl = root.querySelector('[data-epir-inpost-error]');
    if (errorEl) errorEl.hidden = true;
  }

  // Leaflet state per root
  var leafletState = {};

  function initMap(root) {
    var mapWrap = root.querySelector('[data-epir-inpost-map]');
    if (!mapWrap) return;

    // Already has a Leaflet map instance?
    if (leafletState[root.id] && leafletState[root.id].map) {
      setTimeout(function () { leafletState[root.id].map.invalidateSize(); }, 100);
      return;
    }

    // Wait until mapWrap is visible
    if (mapWrap.hidden || mapWrap.offsetParent === null) {
      return;
    }

    var map = L.map(mapWrap, { center: [52.069, 19.48], zoom: 6 });
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      attribution: '(c) OpenStreetMap contributors'
    }).addTo(map);

    var markersLayer = L.layerGroup().addTo(map);

    // Fix size after container becomes visible
    setTimeout(function () { map.invalidateSize(); }, 300);

    leafletState[root.id] = { map: map, markersLayer: markersLayer, points: [] };

    fetchPoints(root);
  }

  function fetchPoints(root) {
    fetch(WORKER_URL + '/points?country=PL')
      .then(function (res) {
        if (!res.ok) throw new Error('Server error: ' + res.status);
        return res.json();
      })
      .then(function (data) {
        hideError(root);
        if (data.error) throw new Error(data.error);
        var state = leafletState[root.id];
        if (!state) return;
        state.points = data;
        // Check if there's an active search query
        var searchInput = root._epirSearchInput || root.querySelector('[data-epir-inpost-search]');
        if (searchInput && searchInput.value.trim()) {
          filterPoints(root, searchInput.value.trim());
        } else {
          renderMarkers(root);
        }
      })
      .catch(function (err) {
        showError(root, 'Nie udalo sie zaladowac punktow. Sprobuj ponownie.');
      });
  }

  function renderMarkers(root, filteredPoints) {
    var state = leafletState[root.id];
    if (!state || !state.map) return;

    state.markersLayer.clearLayers();
    var sourcePoints = filteredPoints || state.points;
    var validPoints = sourcePoints.filter(function (p) {
      return p.coordinates && p.coordinates.latitude !== 0 && p.coordinates.longitude !== 0;
    });

    if (validPoints.length === 0) {
      showError(root, 'Brak dostepnych punktow InPost.');
      return;
    }

    validPoints.forEach(function (point) {
      var marker = L.marker([point.coordinates.latitude, point.coordinates.longitude]);
      marker.bindPopup(
        '<b>' + point.code + '</b><br>' +
        point.address.street + '<br>' +
        point.address.postcode + ' ' + point.address.city +
        (point.opening_hours ? '<br><small>' + point.opening_hours + '</small>' : '')
      );
      marker.on('click', function () { selectPoint(point, root); });
      state.markersLayer.addLayer(marker);
    });

    if (validPoints.length > 0) {
      var bounds = validPoints.map(function (p) {
        return [p.coordinates.latitude, p.coordinates.longitude];
      });
      state.map.fitBounds(bounds, { padding: [50, 50] });
    }
  }

  function selectPoint(point, root) {
    var code = pointCode(point);
    if (!code) return;
    root.classList.add('epir-inpost--saving');
    savePoint(point)
      .then(function () {
        setSummary(root, code, formatAddress(point));
        root.classList.remove('epir-inpost--saving');
        root.classList.add('epir-inpost--selected');
        hideError(root);
      })
      .catch(function () {
        root.classList.remove('epir-inpost--saving');
        showError(root, 'Nie udalo sie zapisac punktu. Sprobuj ponownie.');
      });
  }


  // Search functionality
  var searchDebounce = null;

  function bindSearch(root) {
    var searchInput = root.querySelector('[data-epir-inpost-search]');
    var searchResults = root.querySelector('[data-epir-inpost-search-results]');
    if (!searchInput || !searchResults) return;

    // Store reference to search elements on root for use by filterPoints
    root._epirSearchInput = searchInput;
    root._epirSearchResults = searchResults;

    searchInput.addEventListener('input', function () {
      clearTimeout(searchDebounce);
      searchDebounce = setTimeout(function () {
        filterPoints(root, searchInput.value.trim());
      }, 200);
    });

    searchInput.addEventListener('focus', function () {
      if (searchInput.value.trim()) {
        filterPoints(root, searchInput.value.trim());
      }
    });

    document.addEventListener('click', function (e) {
      if (e.target !== searchInput) {
        hideSearchResults(searchResults);
      }
    });
  }

  function positionSearchResults(searchResults, input) {
    var rect = input.getBoundingClientRect();
    searchResults.style.top = (rect.bottom + 4) + 'px';
    searchResults.style.left = rect.left + 'px';
    searchResults.style.width = rect.width + 'px';
  }

  function hideSearchResults(searchResults) {
    searchResults.style.display = 'none';
    searchResults.hidden = true;
  }

  function showSearchResults(searchResults, input) {
    positionSearchResults(searchResults, input);
    searchResults.style.display = 'block';
    searchResults.hidden = false;
  }

  function filterPoints(root, query) {
    var state = leafletState[root.id];
    var searchResults = root._epirSearchResults || root.querySelector('[data-epir-inpost-search-results]');
    if (!searchResults) return;

    // If points not loaded yet, just return (will be called again after load)
    if (!state || !state.points || state.points.length === 0) {
      return;
    }

    if (!query) {
      hideSearchResults(searchResults);
      renderMarkers(root);
      return;
    }

    // Detect if query looks like a parcel locker symbol (uppercase letters + digits)
    // e.g., KXY123, ABA22, KRM1 etc.
    var symbolPattern = /^[A-Z]{2,4}\d{2,3}$/i;
    var isSymbolSearch = symbolPattern.test(query.toUpperCase().replace(/\s/g, ''));

    var q = query.toLowerCase();
    var matches = state.points.filter(function (p) {
      var code = (p.code || '').toLowerCase();
      var city = (p.address && (p.address.city || '')).toLowerCase();
      var street = (p.address && (p.address.street || '')).toLowerCase();
      var name = (p.name || '').toLowerCase();

      if (isSymbolSearch) {
        // For symbol searches, prioritize exact/partial code match
        var normalizedQuery = query.toUpperCase().replace(/\s/g, '');
        var normalizedCode = p.code.toUpperCase().replace(/\s/g, '');
        return normalizedCode.indexOf(normalizedQuery) !== -1;
      }

      return code.indexOf(q) !== -1 || city.indexOf(q) !== -1 || street.indexOf(q) !== -1 || name.indexOf(q) !== -1;
    });

    if (matches.length === 0) {
      searchResults.innerHTML = '<div class="epir-inpost__search-result-item">Brak wynikow</div>';
      showSearchResults(searchResults, root._epirSearchInput || root.querySelector('[data-epir-inpost-search]'));
      return;
    }

    searchResults.innerHTML = matches.slice(0, 10).map(function (p) {
      var addr = formatAddress(p);
      return '<div class="epir-inpost__search-result-item" data-epir-inpost-select="' + p.code.replace(/"/g, '&quot;') + '">' +
        '<span class="epir-inpost__search-result-code">' + p.code + '</span>' +
        '<span class="epir-inpost__search-result-address">' + addr + '</span>' +
        '</div>';
    }).join('');

    showSearchResults(searchResults, root._epirSearchInput || root.querySelector('[data-epir-inpost-search]'));

    searchResults.querySelectorAll('[data-epir-inpost-select]').forEach(function (el) {
      el.addEventListener('click', function () {
        var code = el.getAttribute('data-epir-inpost-select');
        var point = state.points.find(function (p) { return p.code === code; });
        if (point) {
          selectPoint(point, root);
          hideSearchResults(searchResults);
          var searchInput = root._epirSearchInput || root.querySelector('[data-epir-inpost-search]');
          if (searchInput) searchInput.value = '';
        }
      });
    });

    renderMarkers(root, matches);
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
        // Init Leaflet map now that it's visible
        setTimeout(function () { initMap(root); }, 200);
      } else {
        root.hidden = true;
        var mapWrap = root.querySelector('[data-epir-inpost-map]');
        if (mapWrap) mapWrap.hidden = true;
        // Clear point from cart
        clearPoint().then(function () {
          setSummary(root, '', '');
          root.classList.remove('epir-inpost--selected');
        });
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
      root.classList.add('epir-inpost--selected');
    }

    bindToggle(root);
    bindSearch(root);

    var changeBtn = root.querySelector('[data-epir-inpost-change]');
    if (changeBtn) {
      changeBtn.addEventListener('click', function () {
        root.classList.add('epir-inpost--saving');
        clearPoint()
          .then(function () {
            setSummary(root, '', '');
            root.classList.remove('epir-inpost--selected', 'epir-inpost--saving');
            var mapWrap = root.querySelector('[data-epir-inpost-map]');
            if (mapWrap) mapWrap.hidden = false;
            setTimeout(function () { initMap(root); }, 200);
          })
          .catch(function () {
            root.classList.remove('epir-inpost--saving');
          });
      });
    }
  }

  function loadLeaflet(done) {
    if (window.__epirLeafletReady) {
      if (done) done();
      return;
    }
    if (window.__epirLeafletLoading) {
      window.__epirLeafletLoading.push(done || function () {});
      return;
    }
    window.__epirLeafletLoading = [done || function () {}];

    function finish() {
      window.__epirLeafletReady = true;
      var cbs = window.__epirLeafletLoading || [];
      window.__epirLeafletLoading = null;
      cbs.forEach(function (cb) { try { cb(); } catch (e) {} });
    }

    if (!document.querySelector('link[data-epir-leaflet-css]')) {
      var link = document.createElement('link');
      link.rel = 'stylesheet';
      link.href = 'https://unpkg.com/leaflet@1.9.4/dist/leaflet.css';
      link.setAttribute('data-epir-leaflet-css', '1');
      document.head.appendChild(link);
    }

    if (typeof L !== 'undefined') {
      finish();
      return;
    }

    var existing = document.querySelector('script[data-epir-leaflet-js]');
    if (existing) {
      existing.addEventListener('load', finish);
      return;
    }

    var script = document.createElement('script');
    script.src = 'https://unpkg.com/leaflet@1.9.4/dist/leaflet.js';
    script.setAttribute('data-epir-leaflet-js', '1');
    script.addEventListener('load', finish);
    script.addEventListener('error', finish);
    document.head.appendChild(script);
  }

  function initAll() {
    document.querySelectorAll('[data-epir-inpost-root]').forEach(function (root) {
      root.dataset.epirInpostBound = '';
      bindRoot(root);
      // If checkbox is already checked, init map
      var toggle = root.parentElement ? root.parentElement.querySelector('[data-epir-inpost-toggle]') : null;
      if (toggle && toggle.checked) {
        setTimeout(function () { initMap(root); }, 500);
      }
    });
  }

  function boot() {
    loadLeaflet(function () {
      initAll();
    });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', boot);
  } else {
    boot();
  }

  // Listen for cart updates (e.g. after adding product)
  document.addEventListener('cart:updated', function () {
    loadLeaflet(function () {
      initAll();
    });
  });
  document.addEventListener('minimog:cart:updated', function () {
    loadLeaflet(function () {
      initAll();
    });
  });

  // Expose for drawer re-init
  window.epirInpostAfterCartDom = function () {
    loadLeaflet(function () {
      initAll();
    });
  };
})();
