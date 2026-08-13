import type {Env} from './env';

const UTM_KEYS = [
  'utm_source',
  'utm_medium',
  'utm_campaign',
  'utm_content',
  'utm_term',
] as const;

const CLICK_ID_KEYS = ['gclid', 'gbraid', 'wbraid', 'gad_source'] as const;

/** Preserve Ads / HAM query params when linking to apex PDP or collections. */
export function appendAttributionParams(
  href: string,
  search: string,
): string {
  if (!search || search === '?') return href;
  try {
    const base = new URL(href, 'https://epirbizuteria.pl');
    const incoming = new URLSearchParams(
      search.startsWith('?') ? search.slice(1) : search,
    );
    for (const key of [...UTM_KEYS, ...CLICK_ID_KEYS]) {
      const v = incoming.get(key);
      if (v && !base.searchParams.has(key)) base.searchParams.set(key, v);
    }
    return base.toString();
  } catch {
    return href;
  }
}

export function renderLandingTrackingHead(env: Env): string {
  const gaId = (env.GA4_MEASUREMENT_ID ?? '').trim();
  const gtmId = (env.GTM_CONTAINER_ID ?? 'GTM-NQZ5QCG').trim();
  const gtmHead = gtmId
    ? `<script>(function(w,d,s,l,i){w[l]=w[l]||[];w[l].push({'gtm.start':
new Date().getTime(),event:'gtm.js'});var f=d.getElementsByTagName(s)[0],
j=d.createElement(s),dl=l!='dataLayer'?'&l='+l:'';j.async=true;j.src=
'https://www.googletagmanager.com/gtm.js?id='+i+dl;f.parentNode.insertBefore(j,f);
})(window,document,'script','dataLayer','${gtmId}');</script>`
    : '';
  const gaScriptTag = gaId
    ? `<script async src="https://www.googletagmanager.com/gtag/js?id=${gaId}"></script>`
    : '';
  return `${gtmHead}\n  ${gaScriptTag}`;
}

export function renderLandingTrackingBody(env: Env): string {
  const gtmId = (env.GTM_CONTAINER_ID ?? 'GTM-NQZ5QCG').trim();
  if (!gtmId) return '';
  return `<noscript><iframe src="https://www.googletagmanager.com/ns.html?id=${gtmId}"
height="0" width="0" style="display:none;visibility:hidden"></iframe></noscript>`;
}

export function renderLandingAttributionScript(
  env: Env,
  _opts?: {pageSearch?: string},
): string {
  const gaId = (env.GA4_MEASUREMENT_ID ?? '').trim();
  const adsId = (env.GOOGLE_ADS_TAG_ID ?? '').trim();
  const pixelOrigin =
    (env.EPIR_PIXEL_ORIGIN ?? 'https://asystent.epirbizuteria.pl').replace(
      /\/$/,
      '',
    );

  const gaSnippet = gaId
    ? `
    window.dataLayer = window.dataLayer || [];
    function gtag(){dataLayer.push(arguments);}
    gtag('js', new Date());
    gtag('config', '${gaId}', {
      send_page_view: false,
      linker: {
        domains: ['epirbizuteria.pl', 'l.epirbizuteria.pl'],
        accept_incoming: true,
      },
    });
    gtag('event', 'page_view', {
      page_location: window.location.href,
      page_title: document.title,
    });`
    : '';

  const adsSnippet = adsId
    ? `
    gtag('config', '${adsId}', {
      allow_enhanced_conversions: true,
    });`
    : '';

  return `<script>
    (function () {
      var PIXEL = '${pixelOrigin}/pixel';
      var SESSION_COOKIE = '_epir_session_id';
      var UTM_KEYS = ${JSON.stringify([...UTM_KEYS, ...CLICK_ID_KEYS])};
      var APEX_HOST = 'epirbizuteria.pl';

      function readCookie(name) {
        var parts = document.cookie.split(';');
        for (var i = 0; i < parts.length; i++) {
          var seg = parts[i].trim().split('=');
          if (seg[0] === name) return decodeURIComponent(seg[1] || '');
        }
        return '';
      }

      function writeCookie(name, value) {
        var maxAge = 60 * 60 * 24 * 30;
        document.cookie =
          name + '=' + encodeURIComponent(value) +
          '; path=/; max-age=' + maxAge + '; SameSite=Lax; Secure';
      }

      function sessionId() {
        var existing = readCookie(SESSION_COOKIE);
        if (existing) return existing;
        var id = 'l_' + Date.now().toString(36) + '_' + Math.random().toString(36).slice(2, 10);
        writeCookie(SESSION_COOKIE, id);
        return id;
      }

      function trafficFromSearch(search) {
        var params = new URLSearchParams(search.replace(/^\?/, ''));
        var out = {
          traffic_source: params.get('utm_source') || null,
          traffic_medium: params.get('utm_medium') || null,
          traffic_campaign: params.get('utm_campaign') || null,
          traffic_content: params.get('utm_content') || null,
          traffic_term: params.get('utm_term') || null,
          click_id: null,
          click_id_type: null,
        };
        if (params.get('gclid')) {
          out.click_id = params.get('gclid');
          out.click_id_type = 'gclid';
        } else if (params.get('gbraid')) {
          out.click_id = params.get('gbraid');
          out.click_id_type = 'gbraid';
        } else if (params.get('wbraid')) {
          out.click_id = params.get('wbraid');
          out.click_id_type = 'wbraid';
        }
        return out;
      }

      function appendAttribution(href, search) {
        if (!search) return href;
        try {
          var url = new URL(href, window.location.origin);
          var incoming = new URLSearchParams(search.replace(/^\?/, ''));
          UTM_KEYS.forEach(function (key) {
            var v = incoming.get(key);
            if (v && !url.searchParams.has(key)) url.searchParams.set(key, v);
          });
          return url.toString();
        } catch (e) {
          return href;
        }
      }

      function decorateOutboundLinks() {
        var search = window.location.search;
        document.querySelectorAll('a[href]').forEach(function (link) {
          var href = link.getAttribute('href') || '';
          if (!href || href.indexOf('#') === 0) return;
          try {
            var url = new URL(href, window.location.origin);
            if (url.hostname === APEX_HOST || url.hostname.endsWith('.' + APEX_HOST)) {
              var next = appendAttribution(url.toString(), search);
              if (next !== href) link.setAttribute('href', next);
            }
          } catch (e) { /* ignore */ }
        });
      }

      function postPixel(type, data) {
        var payload = JSON.stringify({ type: type, data: data });
        if (navigator.sendBeacon) {
          var blob = new Blob([payload], { type: 'application/json' });
          navigator.sendBeacon(PIXEL, blob);
          return;
        }
        fetch(PIXEL, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: payload,
          keepalive: true,
          mode: 'cors',
        }).catch(function () {});
      }

      function sendPageView() {
        var traffic = trafficFromSearch(window.location.search);
        postPixel('page_viewed', {
          context: {
            document: {
              location: { href: window.location.href },
              title: document.title,
              referrer: document.referrer || null,
            },
          },
          sessionId: sessionId(),
          storefront_id: 'online-store',
          channel: 'ads-landing',
          traffic_source: traffic.traffic_source,
          traffic_medium: traffic.traffic_medium,
          traffic_campaign: traffic.traffic_campaign,
          traffic_content: traffic.traffic_content,
          traffic_term: traffic.traffic_term,
          click_id: traffic.click_id,
          click_id_type: traffic.click_id_type,
        });
      }

      ${gaSnippet}
      ${adsSnippet}

      decorateOutboundLinks();
      sendPageView();

      document.addEventListener('DOMContentLoaded', decorateOutboundLinks);
    })();
  </script>`;
}
