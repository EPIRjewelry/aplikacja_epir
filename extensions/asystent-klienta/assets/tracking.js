/*
 * Theme App Extension tracking.js
 * - Captures click coordinates, scroll depth, time on page
 * - Publishes custom events via Shopify.analytics.publish (Web Pixel subscribes)
 * - Customer Privacy API (shopify.dev/docs/api/customer-privacy):
 *   gatedPublish() checks customerPrivacy.analyticsProcessingAllowed(); otherwise
 *   queues payloads and listens for document visitorConsentCollected (detail.analyticsAllowed).
 * - Debounces scroll events to reduce noise
 * - page_exit: Shopify.analytics.publish → Web Pixel → POST /pixel only when allowed.
 */
(function () {
  if (typeof Shopify === 'undefined' || !Shopify.analytics || !Shopify.analytics.publish) {
    console.warn('[EPIR Tracking] Shopify.analytics.publish not available');
    return;
  }

  var QUEUE_MAX = 150;
  var queue = [];
  var consentListenerAttached = false;
  var queueOverflowWarned = false;

  function isCustomerPrivacyAvailable() {
    try {
      return (
        typeof window !== 'undefined' &&
        window.Shopify &&
        window.Shopify.customerPrivacy &&
        typeof window.Shopify.customerPrivacy.analyticsProcessingAllowed === 'function'
      );
    } catch (_e) {
      return false;
    }
  }

  function isAnalyticsProcessingAllowedSync() {
    try {
      if (!isCustomerPrivacyAvailable()) return false;
      return window.Shopify.customerPrivacy.analyticsProcessingAllowed() === true;
    } catch (_e) {
      return false;
    }
  }

  function publishAllowed(eventName, payload) {
    Shopify.analytics.publish(eventName, payload);
  }

  function flushQueue() {
    while (queue.length > 0) {
      var item = queue.shift();
      if (item && item.eventName) {
        try {
          publishAllowed(item.eventName, item.payload);
        } catch (_e) {
          /* ignore single-item failures */
        }
      }
    }
  }

  function clearQueue() {
    queue.length = 0;
  }

  function enqueue(eventName, payload) {
    queue.push({ eventName: eventName, payload: payload });
    while (queue.length > QUEUE_MAX) {
      queue.shift();
      if (!queueOverflowWarned) {
        queueOverflowWarned = true;
        console.warn('[EPIR Tracking] Consent queue exceeded ' + QUEUE_MAX + '; dropping oldest events');
      }
    }
  }

  function onVisitorConsentCollected(ev) {
    var detail = ev && ev.detail;
    if (detail && detail.analyticsAllowed === false) {
      clearQueue();
      return;
    }
    var allowedByEvent = detail && detail.analyticsAllowed === true;
    var allowedByApi = isAnalyticsProcessingAllowedSync();
    if (allowedByEvent || allowedByApi) {
      queueMicrotask(flushQueue);
    }
  }

  function ensureVisitorConsentListener() {
    if (consentListenerAttached) return;
    consentListenerAttached = true;
    document.addEventListener('visitorConsentCollected', onVisitorConsentCollected, false);
  }

  function gatedPublish(eventName, payload) {
    if (isAnalyticsProcessingAllowedSync()) {
      publishAllowed(eventName, payload);
      return;
    }
    enqueue(eventName, payload);
    ensureVisitorConsentListener();
  }

  ensureVisitorConsentListener();

  var consentRetryCount = 0;
  var consentRetryMax = 12;
  var consentRetryMs = 3000;
  var consentRetryId = setInterval(function () {
    consentRetryCount += 1;
    if (isAnalyticsProcessingAllowedSync() && queue.length > 0) {
      flushQueue();
    }
    if (consentRetryCount >= consentRetryMax) {
      clearInterval(consentRetryId);
    }
  }, consentRetryMs);

  // Click tracking (with coordinates and element info)
  document.addEventListener('click', function (e) {
    try {
      var target = e.target;
      var el = target && typeof target === 'object' ? target : {};
      var payload = {
        x: e.clientX,
        y: e.clientY,
        element: (el.tagName || '').toLowerCase(),
        id: el.id || null,
        className: el.className || null,
        text: (el.innerText && el.innerText.substring && el.innerText.substring(0, 100)) || null,
        url: window.location.href,
        timestamp: Date.now(),
        viewport: {
          w: window.innerWidth,
          h: window.innerHeight,
        },
      };

      gatedPublish('epir:click_with_position', payload);
    } catch (err) {
      console.warn('[EPIR Tracking] click handler error', err);
    }
  }, { passive: true });

  // Scroll depth tracking (debounced)
  var maxScroll = 0;
  var scrollTimer = null;
  function handleScroll() {
    var scrollPercent =
      Math.round((window.scrollY / (document.body.scrollHeight - window.innerHeight)) * 100) || 0;
    if (scrollPercent > maxScroll) {
      maxScroll = scrollPercent;
      if (scrollTimer) clearTimeout(scrollTimer);
      scrollTimer = setTimeout(function () {
        gatedPublish('epir:scroll_depth', {
          depth: maxScroll,
          url: window.location.href,
          timestamp: Date.now(),
        });
      }, 200);
    }
  }
  window.addEventListener('scroll', handleScroll, { passive: true });

  // Time on page / before unload (single publish per page lifecycle; shared by both listeners)
  var startTime = Date.now();
  var pageExitSent = false;
  function sendTimeOnPage() {
    try {
      if (pageExitSent) return;
      pageExitSent = true;

      var timeOnPage = Math.round((Date.now() - startTime) / 1000);
      var payload = {
        time_on_page_seconds: timeOnPage,
        max_scroll_percent: maxScroll,
        url: window.location.href,
        timestamp: Date.now(),
      };

      gatedPublish('epir:page_exit', payload);
    } catch (err) {
      pageExitSent = false;
      console.warn('[EPIR Tracking] sendTimeOnPage error', err);
    }
  }
  window.addEventListener('beforeunload', sendTimeOnPage);
  document.addEventListener('visibilitychange', function () {
    if (document.visibilityState === 'hidden') sendTimeOnPage();
  });

  // Optional: sample pointer for hover heatmaps (low-frequency sampling)
  var lastPointerSample = 0;
  window.addEventListener('pointermove', function (e) {
    var now = Date.now();
    if (now - lastPointerSample < 5000) return;
    lastPointerSample = now;
    try {
      gatedPublish('epir:mouse_sample', {
        x: e.clientX,
        y: e.clientY,
        url: window.location.href,
        timestamp: now,
      });
    } catch (_err) {
      /* ignore */
    }
  }, { passive: true });

  console.log('[EPIR Tracking] initialized (Customer Privacy gate)');
})();
