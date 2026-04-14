window.__EPIR_ASSISTANT_RUNTIME_LOADED__=true;
// Przywrócona wersja z backupu (UTF-8, poprawne polskie znaki)
// extensions/asystent-klienta/assets/assistant.js
// Shopify canonical storefront ingress: always use App Proxy endpoint.
var EPIR_CHAT_WORKER_ENDPOINT = '/apps/assistant/chat';
var EPIR_LOGGED_IN_CUSTOMER_CACHE_KEY = 'epir-logged-in-customer-id';
var EPIR_LOGGED_IN_CUSTOMER_CACHE_TTL_MS = 2 * 60 * 60 * 1000;
var EPIR_ASSISTANT_SESSION_KEY = 'epir-assistant-session';
var EPIR_ASSISTANT_TRANSCRIPT_STORAGE_PREFIX = 'epir-assistant-transcript';
var EPIR_ASSISTANT_HISTORY_ENDPOINT = '/apps/assistant/history';
var EPIR_ASSISTANT_TRANSCRIPT_MAX_ENTRIES = 100;
var EPIR_IMAGE_ATTACHMENT_PLACEHOLDER = '(załącznik obrazu)';
/** Ostatnio wybrany obraz, izolowany per formularz czatu. */
var epirPendingAttachmentByForm = new WeakMap();
/** Maksymalny rozmiar załącznika obrazu (4 MB po stronie klienta przed base64). */
const EPIR_MAX_ATTACH_BYTES = 4 * 1024 * 1024;

function normalizeLoggedInCustomerId(value) {
  if (value === null || value === undefined) return '';
  var normalized = String(value).trim();
  return normalized ? normalized : '';
}

function getAssistantShopDomain(section) {
  return (
    (section && section.dataset && section.dataset.shopDomain) ||
    (typeof Shopify !== 'undefined' && Shopify && Shopify.shop) ||
    (typeof window !== 'undefined' && window.location && window.location.hostname) ||
    ''
  );
}

function readShopifyGlobalCustomerId() {
  try {
    var analyticsId = normalizeLoggedInCustomerId(
      typeof window !== 'undefined' &&
        window.ShopifyAnalytics &&
        window.ShopifyAnalytics.meta &&
        window.ShopifyAnalytics.meta.page &&
        window.ShopifyAnalytics.meta.page.customerId,
    );
    if (analyticsId) return analyticsId;
  } catch (e) {}

  try {
    var stId = normalizeLoggedInCustomerId(
      typeof window !== 'undefined' &&
        window.__st &&
        (window.__st.cid || window.__st.customerId || window.__st.customer_id),
    );
    if (stId) return stId;
  } catch (e2) {}

  return '';
}

function readCachedLoggedInCustomerId(section) {
  try {
    var raw = sessionStorage.getItem(EPIR_LOGGED_IN_CUSTOMER_CACHE_KEY);
    if (!raw) return '';

    var parsed;
    try {
      parsed = JSON.parse(raw);
    } catch (e) {
      return normalizeLoggedInCustomerId(raw);
    }

    if (!parsed || typeof parsed !== 'object') return '';

    var customerId = normalizeLoggedInCustomerId(parsed.customerId);
    var capturedAt = Number(parsed.capturedAt || 0);
    var cachedShopDomain = normalizeLoggedInCustomerId(parsed.shopDomain);
    var currentShopDomain = normalizeLoggedInCustomerId(getAssistantShopDomain(section));

    if (!customerId) return '';
    if (capturedAt && Date.now() - capturedAt > EPIR_LOGGED_IN_CUSTOMER_CACHE_TTL_MS) return '';
    if (cachedShopDomain && currentShopDomain && cachedShopDomain !== currentShopDomain) return '';

    return customerId;
  } catch (e3) {
    return '';
  }
}

function writeCachedLoggedInCustomerId(section, customerId) {
  var normalized = normalizeLoggedInCustomerId(customerId);
  if (!normalized) return '';
  try {
    sessionStorage.setItem(
      EPIR_LOGGED_IN_CUSTOMER_CACHE_KEY,
      JSON.stringify({
        customerId: normalized,
        shopDomain: normalizeLoggedInCustomerId(getAssistantShopDomain(section)),
        capturedAt: Date.now(),
      }),
    );
  } catch (e) {}
  return normalized;
}

function resolveLoggedInCustomerId(section) {
  var datasetId = normalizeLoggedInCustomerId(section && section.dataset && section.dataset.loggedInCustomerId);
  if (datasetId) {
    writeCachedLoggedInCustomerId(section, datasetId);
    return datasetId;
  }

  var globalId = readShopifyGlobalCustomerId();
  if (globalId) {
    if (section && section.dataset) {
      section.dataset.loggedInCustomerId = globalId;
    }
    writeCachedLoggedInCustomerId(section, globalId);
    return globalId;
  }

  var cachedId = readCachedLoggedInCustomerId(section);
  if (cachedId) {
    if (section && section.dataset) {
      section.dataset.loggedInCustomerId = cachedId;
    }
    return cachedId;
  }

  return '';
}

/* ===== CONSENT GATE (App Proxy POST /apps/assistant/consent) ===== */
var EPIR_CONSENT_ANONYMOUS_KEY = 'epir-chat-anonymous-id';

function getEpirAnonymousIdForConsent() {
  try {
    var id = sessionStorage.getItem(EPIR_CONSENT_ANONYMOUS_KEY);
    if (!id && typeof crypto !== 'undefined' && crypto.randomUUID) {
      id = crypto.randomUUID();
      sessionStorage.setItem(EPIR_CONSENT_ANONYMOUS_KEY, id);
    }
    return id || String(Date.now());
  } catch (e) {
    return String(Date.now());
  }
}

function getConsentStorageKeyForSection(section) {
  var id = (section && section.dataset && section.dataset.consentId) || 'epir-theme-liquid-chat-v1';
  return 'epir-consent:' + id;
}

/**
 * Payload zgodny z workers/chat `parseConsentJsonBody` (tryb App Proxy nadpisuje storefront/channel po stronie serwera).
 * Eksponowane do ewentualnych testów integracyjnych.
 */
function buildConsentEvent(section) {
  var consentId = (section.dataset && section.dataset.consentId) || 'epir-theme-liquid-chat-v1';
  var sessionKey = 'epir-assistant-session';
  var sessionId = '';
  try {
    sessionId = sessionStorage.getItem(sessionKey) || '';
  } catch (e) {}
  if (!sessionId) sessionId = getEpirAnonymousIdForConsent();
  var shopDomain = '';
  try {
    shopDomain =
      (section.dataset && section.dataset.shopDomain) ||
      (typeof window !== 'undefined' && window.location && window.location.hostname) ||
      '';
  } catch (e2) {}
  var cid = resolveLoggedInCustomerId(section) || null;
  return {
    consentId: consentId,
    granted: true,
    source: 'theme-app-extension',
    storefrontId: (section.dataset && section.dataset.storefrontId) || 'epir-liquid',
    channel: (section.dataset && section.dataset.channel) || 'online-store',
    shopDomain: shopDomain,
    route:
      typeof window !== 'undefined' && window.location && window.location.pathname
        ? window.location.pathname
        : '/',
    sessionId: sessionId,
    anonymousId: getEpirAnonymousIdForConsent(),
    customerId: cid,
    timestamp: Date.now(),
  };
}

function buildConsentFetchUrl(section, basePath) {
  var endpoint = basePath || (section.dataset && section.dataset.consentEndpoint) || '/apps/assistant/consent';
  var shop = (section.dataset && section.dataset.shopDomain) || '';
  var customerId = resolveLoggedInCustomerId(section) || '';
  if (shop || customerId) {
    var params = new URLSearchParams();
    if (shop) params.set('shop', shop);
    if (customerId) params.set('logged_in_customer_id', customerId);
    endpoint = endpoint + (endpoint.indexOf('?') >= 0 ? '&' : '?') + params.toString();
  }
  return endpoint;
}

function submitConsentEvent(payload, section) {
  var url = buildConsentFetchUrl(section, (section.dataset && section.dataset.consentEndpoint) || '/apps/assistant/consent');
  return fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Accept: 'application/json, text/plain',
    },
    credentials: 'include',
    body: JSON.stringify(payload),
  });
}

function setConsentBarSaving(section, saving) {
  var bar = section.querySelector('[data-epir-consent-bar]');
  if (!bar) return;
  if (saving) bar.classList.add('epir-assistant-consent-bar--saving');
  else bar.classList.remove('epir-assistant-consent-bar--saving');
}

function setConsentGateError(section, message) {
  var el = section.querySelector('[data-epir-consent-error]');
  if (!el) return;
  if (message) {
    el.textContent = message;
    el.removeAttribute('hidden');
  } else {
    el.textContent = '';
    el.setAttribute('hidden', '');
  }
}

function lockChatUi(section) {
  section.classList.add('epir-assistant--consent-locked');
  var bar = section.querySelector('[data-epir-consent-bar]');
  if (bar) bar.classList.add('epir-assistant-consent-bar--locked');
  var launcher = section.querySelector('#assistant-launcher') || section.querySelector('#assistant-launcher-embed');
  if (launcher) {
    launcher.setAttribute('disabled', 'disabled');
    launcher.setAttribute('aria-disabled', 'true');
  }
  ['#assistant-input', '#assistant-input-embed', '#assistant-send-button', '#assistant-send-button-embed'].forEach(function (sel) {
    var el = section.querySelector(sel);
    if (el) el.setAttribute('disabled', 'disabled');
  });
  section.querySelectorAll('.assistant-attach-btn').forEach(function (btn) {
    btn.setAttribute('disabled', 'disabled');
  });
  var fi = section.querySelector('#assistant-file-input-embed') || section.querySelector('#assistant-file-input-section');
  if (fi) fi.setAttribute('disabled', 'disabled');
}

function unlockChatUi(section) {
  section.classList.remove('epir-assistant--consent-locked');
  var bar = section.querySelector('[data-epir-consent-bar]');
  if (bar) bar.classList.remove('epir-assistant-consent-bar--locked');
  var launcher = section.querySelector('#assistant-launcher') || section.querySelector('#assistant-launcher-embed');
  if (launcher) {
    launcher.removeAttribute('disabled');
    launcher.setAttribute('aria-disabled', 'false');
  }
  ['#assistant-input', '#assistant-input-embed', '#assistant-send-button', '#assistant-send-button-embed'].forEach(function (sel) {
    var el = section.querySelector(sel);
    if (el) el.removeAttribute('disabled');
  });
  section.querySelectorAll('.assistant-attach-btn').forEach(function (btn) {
    btn.removeAttribute('disabled');
  });
  var fi = section.querySelector('#assistant-file-input-embed') || section.querySelector('#assistant-file-input-section');
  if (fi) fi.removeAttribute('disabled');
}

function initConsentGateForSection(section) {
  if (!section || section.dataset.epirConsentInit === '1') return;
  section.dataset.epirConsentInit = '1';
  var cb = section.querySelector('.epir-assistant-consent-checkbox');
  var storageKey = getConsentStorageKeyForSection(section);
  var granted = false;
  try {
    granted = localStorage.getItem(storageKey) === 'true';
  } catch (e) {}

  if (granted) {
    try {
      if (cb) cb.checked = true;
    } catch (e2) {}
    unlockChatUi(section);
  } else {
    lockChatUi(section);
  }

  if (cb) {
    cb.addEventListener('change', function () {
      if (!cb.checked) {
        try {
          localStorage.setItem(storageKey, 'false');
        } catch (e) {}
        setConsentGateError(section, '');
        lockChatUi(section);
        return;
      }
      setConsentBarSaving(section, true);
      setConsentGateError(section, '');
      cb.setAttribute('disabled', 'disabled');
      submitConsentEvent(buildConsentEvent(section), section)
        .then(function (res) {
          setConsentBarSaving(section, false);
          cb.removeAttribute('disabled');
          if (res.ok && res.status >= 200 && res.status < 300) {
            try {
              localStorage.setItem(storageKey, 'true');
            } catch (e3) {}
            unlockChatUi(section);
          } else {
            cb.checked = false;
            lockChatUi(section);
            setConsentGateError(
              section,
              'Nie udało się zapisać zgody (' + res.status + '). Spróbuj ponownie.'
            );
          }
        })
        .catch(function (err) {
          setConsentBarSaving(section, false);
          cb.removeAttribute('disabled');
          cb.checked = false;
          lockChatUi(section);
          setConsentGateError(
            section,
            err && err.message ? err.message : 'Błąd sieci. Spróbuj ponownie.'
          );
        });
    });
  }

  var launcher = section.querySelector('#assistant-launcher') || section.querySelector('#assistant-launcher-embed');
  if (launcher) {
    launcher.addEventListener(
      'click',
      function (ev) {
        if (section.classList.contains('epir-assistant--consent-locked')) {
          ev.preventDefault();
          ev.stopPropagation();
        }
      },
      true
    );
  }
}

function getPendingAttachment(form) {
  return form ? (epirPendingAttachmentByForm.get(form) || null) : null;
}

function setPendingAttachment(form, attachment) {
  if (!form) return;
  if (attachment) {
    epirPendingAttachmentByForm.set(form, attachment);
  } else {
    epirPendingAttachmentByForm.delete(form);
  }
  renderAttachmentPreview(form);
}

/**
 * Kontener podglądu zdjęcia (nad paskiem inputu) — tworzony dynamicznie.
 */
function getOrCreateAttachmentPreviewEl(form) {
  if (!form || !form.parentNode) return null;
  const parent = form.parentNode;
  var el = parent.querySelector('.epir-assistant-attach-preview');
  if (!el) {
    el = document.createElement('div');
    el.className = 'epir-assistant-attach-preview';
    el.setAttribute('hidden', '');
    parent.insertBefore(el, form);
  }
  return el;
}

function renderAttachmentPreview(form) {
  const att = getPendingAttachment(form);
  const wrap = getOrCreateAttachmentPreviewEl(form);
  if (!wrap) return;
  if (!att || !att.data) {
    wrap.setAttribute('hidden', '');
    wrap.textContent = '';
    return;
  }
  wrap.removeAttribute('hidden');
  wrap.innerHTML = '';
  const src = 'data:' + (att.mediaType || 'image/jpeg') + ';base64,' + att.data;
  const img = document.createElement('img');
  img.className = 'epir-assistant-attach-preview__img';
  img.src = src;
  img.alt = 'Podgląd załączonego zdjęcia';
  const meta = document.createElement('div');
  meta.className = 'epir-assistant-attach-preview__meta';
  const nameEl = document.createElement('span');
  nameEl.className = 'epir-assistant-attach-preview__name';
  nameEl.textContent = att.fileName ? String(att.fileName) : 'Zdjęcie do wysłania';
  const clearBtn = document.createElement('button');
  clearBtn.type = 'button';
  clearBtn.className = 'epir-assistant-attach-preview__clear';
  clearBtn.setAttribute('aria-label', 'Usuń załącznik');
  clearBtn.textContent = '×';
  clearBtn.addEventListener('click', function (e) {
    e.preventDefault();
    setPendingAttachment(form, null);
    form.querySelectorAll('.assistant-attach-btn--active').forEach(function (btn) {
      btn.classList.remove('assistant-attach-btn--active');
      btn.title = '';
    });
  });
  meta.appendChild(nameEl);
  meta.appendChild(clearBtn);
  wrap.appendChild(img);
  wrap.appendChild(meta);
}

/**
 * Wyświetla krótki komunikat błędu w elemencie statusu najbliższym formularza.
 * Komunikat znika po 4 sekundach.
 */
function showAttachError(form, message) {
  var statusEl = document.getElementById(
    form.id === 'assistant-form-embed' ? 'assistant-status-embed' : 'assistant-status'
  );
  if (!statusEl) return;
  statusEl.textContent = message;
  statusEl.style.color = '#c0392b';
  clearTimeout(statusEl._epirErrTimer);
  statusEl._epirErrTimer = setTimeout(function () {
    if (statusEl.textContent === message) {
      statusEl.textContent = '';
      statusEl.style.color = '';
    }
  }, 4000);
}

function stripDataUrlPrefix(dataUrl) {
  if (typeof dataUrl !== 'string') return '';
  var comma = dataUrl.indexOf(',');
  return comma >= 0 ? dataUrl.slice(comma + 1) : dataUrl;
}

/**
 * Ukryty input file + przycisk spinacza przy formularzu czatu (embed / sekcja).
 */
function ensureAssistantFileControls() {
  var forms = document.querySelectorAll('#assistant-form-embed, #assistant-form');
  for (let fi = 0; fi < forms.length; fi++) {
    const form = forms[fi];
    if (form.dataset.epirFileControlsInit === '1') continue;
    form.dataset.epirFileControlsInit = '1';

    const fileInput = document.createElement('input');
    fileInput.type = 'file';
    fileInput.accept = 'image/*';
    fileInput.setAttribute('aria-hidden', 'true');
    fileInput.style.position = 'absolute';
    fileInput.style.width = '0';
    fileInput.style.height = '0';
    fileInput.style.opacity = '0';
    fileInput.style.pointerEvents = 'none';
    fileInput.id = form.id === 'assistant-form-embed' ? 'assistant-file-input-embed' : 'assistant-file-input-section';

    const attachBtn = document.createElement('button');
    attachBtn.type = 'button';
    attachBtn.setAttribute('aria-label', 'Dodaj zdjęcie');
    attachBtn.className = 'assistant-attach-btn';
    attachBtn.textContent = '📎';

    fileInput.addEventListener('change', function () {
      const f = fileInput.files && fileInput.files[0];
      fileInput.value = '';
      if (!f || !f.type || f.type.indexOf('image/') !== 0) {
        setPendingAttachment(form, null);
        attachBtn.classList.remove('assistant-attach-btn--active');
        attachBtn.title = '';
        return;
      }
      if (f.size > EPIR_MAX_ATTACH_BYTES) {
        setPendingAttachment(form, null);
        attachBtn.classList.remove('assistant-attach-btn--active');
        attachBtn.title = '';
        showAttachError(form, 'Zdjęcie jest za duże (max 4 MB). Wybierz mniejszy plik.');
        return;
      }
      const reader = new FileReader();
      reader.onload = function () {
        const raw = reader.result;
        if (typeof raw !== 'string') {
          setPendingAttachment(form, null);
          attachBtn.classList.remove('assistant-attach-btn--active');
          attachBtn.title = '';
          return;
        }
        setPendingAttachment(form, {
          data: stripDataUrlPrefix(raw),
          mediaType: f.type || 'image/jpeg',
          fileName: f.name || '',
        });
        attachBtn.classList.add('assistant-attach-btn--active');
        attachBtn.title = f.name || 'Zdjęcie gotowe do wysłania';
      };
      reader.onerror = function () {
        setPendingAttachment(form, null);
        attachBtn.classList.remove('assistant-attach-btn--active');
        attachBtn.title = '';
      };
      reader.readAsDataURL(f);
    });

    attachBtn.addEventListener('click', function (e) {
      e.preventDefault();
      fileInput.click();
    });

    const sendBtn = form.querySelector('#assistant-send-button-embed') || form.querySelector('#assistant-send-button');
    if (sendBtn) {
      form.insertBefore(fileInput, sendBtn);
      form.insertBefore(attachBtn, sendBtn);
    } else {
      form.appendChild(fileInput);
      form.appendChild(attachBtn);
    }
  }
}

// Lekki, poprawiony klient czatu z obsługą streaming SSE/JSON + fallback.
// Kompiluj do JS (np. tsc) przed użyciem w Theme App Extension.

/* ===== CART INTEGRATION ===== */

/**
 * Pobiera cart_id z Shopify Cart API (localStorage lub /cart.js)
 * Zwraca cart_id w formacie gid://shopify/Cart/xyz lub null
 */
async function getShopifyCartId() {
  try {
    // Shopify cart token jest dostępny w localStorage lub przez /cart.js
    const cartRes = await fetch('/cart.js', {
      method: 'GET',
      credentials: 'same-origin',
      headers: { 'Content-Type': 'application/json' }
    });
    
    if (!cartRes.ok) {
      console.warn('Failed to fetch Shopify cart:', cartRes.status);
      return null;
    }
    
    const cartData = await cartRes.json();
    // Shopify cart response: { token: "...", items: [...], ... }
    if (cartData && cartData.token) {
      // Convert token to GID format
      return `gid://shopify/Cart/${cartData.token}`;
    }
    
    return null;
  } catch (err) {
    // W getShopifyCartId() nie mamy kontekstu wiadomości (message id) ani renderMode.
    // Zgłaszamy błąd do Analytics i zwracamy null, aby chat mógł kontynuować.
    console.error('[Assistant] getShopifyCartId error', err);
    try { 
      reportUiExtensionError(err, { stage: 'get_cart_id' }); 
    } catch (e) { 
      console.warn('reportUiExtensionError failed', e); 
    }
    return null;
  }
}

/**
 * Usuwa z treści literalny śmieć `tool_calls: [...]` (model czasem powiela przykłady z promptu).
 */
function stripLeakedToolCallsLiterals(text) {
  if (!text || typeof text !== 'string') return '';
  var out = text;
  for (var guard = 0; guard < 12; guard++) {
    var m = /\btool_calls\s*:/i.exec(out);
    if (!m) break;
    var start = m.index;
    var i = start + m[0].length;
    while (i < out.length && /\s/.test(out[i])) i++;
    if (out[i] !== '[') {
      out = out.slice(0, start) + out.slice(i);
      continue;
    }
    var depth = 0;
    var j = i;
    for (; j < out.length; j++) {
      var c = out[j];
      if (c === '[') depth++;
      else if (c === ']') {
        depth--;
        if (depth === 0) {
          out = out.slice(0, start) + out.slice(j + 1);
          break;
        }
      }
    }
    if (j >= out.length) {
      out = out.slice(0, start).replace(/\s+$/,'');
      break;
    }
  }
  return out.replace(/\n{3,}/g, '\n\n').trim();
}

/**
 * Parsuje odpowiedź asystenta i wyodrębnia specjalne akcje
 * Zwraca obiekt z parsed text + extracted actions
 */
function parseAssistantResponse(text) {
  const actions = {
    hasCheckoutUrl: false,
    checkoutUrl: null,
    hasCartUpdate: false,
    cartItems: [],
    hasOrderStatus: false,
    orderDetails: null
  };
  
  let cleanedText = text;

  // Model czasem wypisuje literalny tekst `tool_calls: [...]` (powielenie przykładów z promptu) zamiast użyć API — ukryj przed klientem
  cleanedText = stripLeakedToolCallsLiterals(cleanedText);
  
  // Wyczyść ewentualne markery Harmony/tool_call (fallback) zanim pokażemy userowi
  cleanedText = cleanedText
    .replace(/<\|call\|>[\s\S]*?<\|end\|>/g, '')
    .replace(/<\|return\|>[\s\S]*?<\|end\|>/g, '')
    .replace(/<\|.*?\|>/g, '')
    .trim();
  
  // Wykryj checkout URL
  const checkoutUrlMatch = text.match(/https:\/\/[^\s]+\/checkouts\/[^\s]+/);
  if (checkoutUrlMatch) {
    actions.hasCheckoutUrl = true;
    actions.checkoutUrl = checkoutUrlMatch[0];
  }
  
  // Wykryj akcje koszyka w formacie [CART_UPDATED: ...]
  const cartActionMatch = text.match(/\[CART_UPDATED:([^\]]+)\]/);
  if (cartActionMatch) {
    actions.hasCartUpdate = true;
    cleanedText = cleanedText.replace(/\[CART_UPDATED:[^\]]+\]/, '').trim();
  }
  
  // Wykryj status zamówienia w formacie [ORDER_STATUS: ...]
  const orderStatusMatch = text.match(/\[ORDER_STATUS:([^\]]+)\]/);
  if (orderStatusMatch) {
    actions.hasOrderStatus = true;
    try {
      actions.orderDetails = JSON.parse(orderStatusMatch[1]);
    } catch (e) {
      console.warn('Failed to parse order details:', e);
    }

    cleanedText = cleanedText.replace(/\[ORDER_STATUS:[^\]]+\]/, '').trim();
  }
  
  return { text: cleanedText, actions };
}

/**
 * Renderuje specjalny widget checkout button jeśli wykryto URL
 */
function renderCheckoutButton(checkoutUrl, messageEl) {
  const btn = document.createElement('a');
  btn.href = checkoutUrl;
  btn.className = 'epir-checkout-button';
  btn.textContent = 'Przejdź do kasy →';
  btn.setAttribute('target', '_blank');
  btn.setAttribute('rel', 'noopener noreferrer');
  btn.style.cssText = 'display:inline-block;margin-top:10px;padding:10px 20px;background:#000;color:#fff;text-decoration:none;border-radius:4px;font-weight:bold;';
  
  messageEl.appendChild(document.createElement('br'));
  messageEl.appendChild(btn);
}

function reportUiExtensionError(error, context = {}) {
  try {
    const publish =
      typeof Shopify !== 'undefined' &&
      Shopify &&
      Shopify.analytics &&
      typeof Shopify.analytics.publish === 'function'
        ? Shopify.analytics.publish
        : null;
    if (!publish) return;

    const safeError = error instanceof Error ? error : new Error(String(error));
    publish('ui_extension_errored', {
      source: 'assistant',
      message: safeError.message,
      stack: safeError.stack || null,
      url: typeof window !== 'undefined' ? window.location.href : null,
      timestamp: Date.now(),
      ...context,
    });
  } catch (publishErr) {
    console.warn('[EPIR Assistant] Failed to publish ui_extension_errored', publishErr);
  }
}

// Helper: find section (block or embed)
function getAssistantSection() {
  return document.getElementById('epir-assistant-embed') || document.getElementById('epir-assistant-section');
}

// Canonicalize endpoint so storefront always uses a single source of truth.
function normalizeAssistantEndpoint() {
  return EPIR_CHAT_WORKER_ENDPOINT;
}

// Teleport: przenosi widżet do body, aby position:fixed działał (sekcje mają transform/overflow)
function teleportAssistantToBody(section) {
  if (!section || !document.body) return;
  if (section.parentElement === document.body) return;
  try {
    document.body.appendChild(section);
  } catch (e) {
    console.warn('[EPIR Assistant] Teleport failed', e);
  }
}


function getAssistantHistoryEndpoint(section) {
  return (
    (section && section.dataset && section.dataset.historyEndpoint) ||
    EPIR_ASSISTANT_HISTORY_ENDPOINT
  );
}

function getAssistantTranscriptStorageKey(section, actorId) {
  var normalizedActor = normalizeLoggedInCustomerId(actorId) || getEpirAnonymousIdForConsent();
  var shopDomain = normalizeLoggedInCustomerId(getAssistantShopDomain(section)) || 'unknown-shop';
  var storefrontId = normalizeLoggedInCustomerId(section && section.dataset && section.dataset.storefrontId) || 'epir-liquid';
  var channel = normalizeLoggedInCustomerId(section && section.dataset && section.dataset.channel) || 'online-store';
  return [
    EPIR_ASSISTANT_TRANSCRIPT_STORAGE_PREFIX,
    'tae',
    shopDomain,
    storefrontId,
    channel,
    normalizedActor,
  ].join(':');
}

function getAssistantTranscriptStorageKeys(section, sessionIdKey) {
  var keys = [];
  var seen = {};
  var addKey = function (actorId) {
    var key = getAssistantTranscriptStorageKey(section, actorId);
    if (key && !seen[key]) {
      seen[key] = true;
      keys.push(key);
    }
  };

  try {
    var sessionId = sessionStorage.getItem(sessionIdKey || EPIR_ASSISTANT_SESSION_KEY);
    if (sessionId) addKey(sessionId);
  } catch (e) {}

  try {
    var anonymousId = sessionStorage.getItem(EPIR_CONSENT_ANONYMOUS_KEY);
    if (anonymousId) addKey(anonymousId);
  } catch (e2) {}

  addKey(getEpirAnonymousIdForConsent());
  return keys;
}

function normalizeAssistantTranscriptEntries(entries) {
  if (!Array.isArray(entries)) return [];
  var normalized = [];
  for (var i = 0; i < entries.length; i++) {
    var entry = entries[i];
    if (!entry || typeof entry !== 'object') continue;
    var role = entry.role === 'assistant' ? 'assistant' : entry.role === 'user' ? 'user' : '';
    var content = typeof entry.content === 'string' ? entry.content.trim() : '';
    if (!role || !content) continue;
    normalized.push({ role: role, content: content });
  }
  return normalized.slice(-EPIR_ASSISTANT_TRANSCRIPT_MAX_ENTRIES);
}

function readAssistantTranscript(section, sessionIdKey) {
  var keys = getAssistantTranscriptStorageKeys(section, sessionIdKey);
  var primaryKey = keys[0] || null;
  for (var i = 0; i < keys.length; i++) {
    try {
      var raw = sessionStorage.getItem(keys[i]);
      if (!raw) continue;
      var normalized = normalizeAssistantTranscriptEntries(JSON.parse(raw));
      if (!normalized.length) continue;
      if (primaryKey && primaryKey !== keys[i]) {
        sessionStorage.setItem(primaryKey, JSON.stringify(normalized));
      }
      return normalized;
    } catch (e) {}
  }
  return [];
}

function syncAssistantTranscriptStorage(section, transcript, sessionIdKey) {
  var normalized = normalizeAssistantTranscriptEntries(transcript);
  var keys = getAssistantTranscriptStorageKeys(section, sessionIdKey);
  try {
    if (!normalized.length) {
      for (var i = 0; i < keys.length; i++) {
        sessionStorage.removeItem(keys[i]);
      }
      return normalized;
    }
    var serialized = JSON.stringify(normalized);
    for (var j = 0; j < keys.length; j++) {
      sessionStorage.setItem(keys[j], serialized);
    }
  } catch (e) {}
  return normalized;
}

function extractAssistantTranscriptFromDom(messagesEl) {
  if (!messagesEl) return [];
  var nodes = messagesEl.querySelectorAll('.msg');
  var transcript = [];
  for (var i = 0; i < nodes.length; i++) {
    var node = nodes[i];
    if (!node || !node.classList) continue;
    if (node.classList.contains('welcome-message') || node.classList.contains('proactive-greeting')) continue;
    var role = node.classList.contains('msg-user')
      ? 'user'
      : node.classList.contains('msg-assistant')
        ? 'assistant'
        : '';
    if (!role) continue;
    var bubble = node.querySelector('.epir-message__bubble');
    var content = role === 'assistant' && bubble ? bubble.textContent || '' : node.textContent || '';
    if (role === 'user' && node.classList.contains('msg-user--with-attachment') && !String(content).trim()) {
      content = EPIR_IMAGE_ATTACHMENT_PLACEHOLDER;
    }
    content = String(content || '').trim();
    if (!content) continue;
    transcript.push({ role: role, content: content });
  }
  return normalizeAssistantTranscriptEntries(transcript);
}

function persistAssistantTranscriptFromDom(section, messagesEl, sessionIdKey) {
  return syncAssistantTranscriptStorage(
    section,
    extractAssistantTranscriptFromDom(messagesEl),
    sessionIdKey,
  );
}

function renderAssistantTranscript(messagesEl, transcript) {
  if (!messagesEl) return;
  messagesEl.innerHTML = '';
  var normalized = normalizeAssistantTranscriptEntries(transcript);
  for (var i = 0; i < normalized.length; i++) {
    var entry = normalized[i];
    if (entry.role === 'user') {
      createUserMessage(messagesEl, entry.content);
      continue;
    }
    var assistantMessage = createAssistantMessage(messagesEl);
    updateAssistantMessage(assistantMessage.id, entry.content);
    finalizeAssistantMessage(assistantMessage.id);
  }
  messagesEl.scrollTop = messagesEl.scrollHeight;
}

function buildAssistantHistoryFetchUrl(section) {
  var endpoint = getAssistantHistoryEndpoint(section);
  var shop = getAssistantShopDomain(section) || '';
  var customerId = resolveLoggedInCustomerId(section) || '';
  if (shop || customerId) {
    var params = new URLSearchParams();
    if (shop) params.set('shop', shop);
    if (customerId) params.set('logged_in_customer_id', customerId);
    endpoint = endpoint + (endpoint.indexOf('?') >= 0 ? '&' : '?') + params.toString();
  }
  return endpoint;
}

async function fetchAssistantTranscriptFromBackend(section, sessionIdKey) {
  var sessionId = '';
  try {
    sessionId = sessionStorage.getItem(sessionIdKey || EPIR_ASSISTANT_SESSION_KEY) || '';
  } catch (e) {}
  if (!sessionId) return [];

  var response = await fetch(buildAssistantHistoryFetchUrl(section), {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Accept: 'application/json',
    },
    credentials: 'include',
    body: JSON.stringify({ session_id: sessionId }),
  });

  if (!response.ok) {
    throw new Error('History request failed (' + response.status + ')');
  }

  var data = await response.json().catch(function () { return null; });
  var history = Array.isArray(data)
    ? data
    : data && Array.isArray(data.history)
      ? data.history
      : [];
  return normalizeAssistantTranscriptEntries(history);
}

function syncAssistantTranscriptFromBackend(section, messagesEl, sessionIdKey) {
  if (!section || !messagesEl || section.dataset.assistantHistorySync === '1') return;
  section.dataset.assistantHistorySync = '1';
  fetchAssistantTranscriptFromBackend(section, sessionIdKey)
    .then(function (history) {
      if (!history.length) return;
      var current = extractAssistantTranscriptFromDom(messagesEl);
      if (JSON.stringify(current) === JSON.stringify(history)) return;
      renderAssistantTranscript(messagesEl, history);
      syncAssistantTranscriptStorage(section, history, sessionIdKey);
    })
    .catch(function (error) {
      console.warn('[EPIR Assistant] History sync failed', error);
    });
}

// Minimal initializer: bind toggle button to open/close the assistant (supports block + embed)
function initAssistantUIForSection(section) {
  if (!section || section.dataset.assistantUiInit === '1') return;
  try {
    teleportAssistantToBody(section);
    const launcher = section.querySelector('#assistant-launcher') || section.querySelector('#assistant-launcher-embed');
    const closeBtn = section.querySelector('#assistant-close-button') || section.querySelector('#assistant-close-button-embed');
    const content = section.querySelector('#assistant-content') || section.querySelector('#assistant-content-embed');
    const panel = section.querySelector('#assistant-panel') || section.querySelector('#assistant-panel-embed');
    if (!content) return;

    /** Panel wraps header + body; is-closed toggles whole floating card (not inner content only). */
    const toggleTarget = panel || content;

    const inline =
      section.dataset.inlineAssistant === '1' ||
      (section.id === 'epir-assistant-section' && !launcher);

    if (inline) {
      toggleTarget.classList.remove('is-closed');
      section.dataset.assistantUiInit = '1';
    } else {
      if (!launcher) return;
      section.dataset.assistantUiInit = '1';
      if (!closeBtn) {
        try {
          console.warn(
            '[EPIR Assistant] Brak przycisku zamknięcia (#assistant-close-button / #assistant-close-button-embed) — otwieranie działa; zamykanie z nagłówka może być niedostępne.'
          );
        } catch (e) {}
      }

      launcher.addEventListener('click', (e) => {
        e.preventDefault();
        if (toggleTarget) {
          toggleTarget.classList.remove('is-closed');
          launcher.setAttribute('aria-expanded', 'true');
        }
      });

      if (closeBtn) {
        closeBtn.addEventListener('click', (e) => {
          e.preventDefault();
          if (toggleTarget) {
            toggleTarget.classList.add('is-closed');
            launcher.setAttribute('aria-expanded', 'false');
          }
        });
      }

      if (toggleTarget && !toggleTarget.classList.contains('is-closed')) {
        launcher.setAttribute('aria-expanded', 'true');
      }
    }

    // --- Powitanie klienta imieniem z localStorage/sessionStorage ---
    const messagesEl = section.querySelector('#assistant-messages') || section.querySelector('#assistant-messages-embed');
    const restoredTranscript = messagesEl
      ? readAssistantTranscript(section, EPIR_ASSISTANT_SESSION_KEY)
      : [];
    const hasRestoredTranscript = restoredTranscript.length > 0;
    if (hasRestoredTranscript && messagesEl) {
      renderAssistantTranscript(messagesEl, restoredTranscript);
    }
    if (messagesEl) {
      syncAssistantTranscriptFromBackend(section, messagesEl, EPIR_ASSISTANT_SESSION_KEY);
    }

    let localName = null;
    try {
      localName = localStorage.getItem('epir_customer_name') || sessionStorage.getItem('epir_customer_name');
    } catch {}
    const loggedInCustomerId = resolveLoggedInCustomerId(section) || '';
    if (localName && !loggedInCustomerId && messagesEl && !hasRestoredTranscript) {
      // Dodaj powitanie z imieniem tylko dla lokalnie rozpoznanego klienta, gdy brak transcriptu do odtworzenia
      const welcomeDiv = document.createElement('div');
      welcomeDiv.className = 'msg msg-assistant welcome-message';
      welcomeDiv.setAttribute('role', 'status');
      const welcomeBubble = document.createElement('div');
      welcomeBubble.className = 'epir-message__bubble';
      welcomeBubble.textContent = `Witaj ponownie, ${localName}! Miło Cię widzieć.`;
      welcomeDiv.appendChild(welcomeBubble);
      messagesEl.insertBefore(welcomeDiv, messagesEl.firstChild);
    }

    // --- Banner informacyjny dla klientów rozpoznanych lokalnie, ale nie zalogowanych ---
    const banner = document.getElementById('local-memory-banner');
    if (banner && !loggedInCustomerId && localName) {
      banner.style.display = 'block';
    }

    // ============================================================================
    // PROACTIVE CHAT ACTIVATION - Listen for events from Web Pixel
    // ============================================================================
    // Web Pixel emits 'epir:activate-chat' when analytics-worker recommends activation
    window.addEventListener('epir:activate-chat', (event) => {
      console.log('[EPIR Assistant] 🚀 Proactive chat activation triggered:', event.detail);
      if (section.classList.contains('epir-assistant--consent-locked')) {
        return;
      }

      // Auto-open chat if closed
      const shell = section.querySelector('#assistant-panel') || section.querySelector('#assistant-panel-embed') || content;
      if (shell && shell.classList.contains('is-closed')) {
        shell.classList.remove('is-closed');
        if (launcher) launcher.setAttribute('aria-expanded', 'true');
        console.log('[EPIR Assistant] ✅ Chat opened proactively');
      }
      
      // Optional: Add proactive greeting message
      if (messagesEl && event.detail && event.detail.reason) {
        const proactiveMsg = document.createElement('div');
        proactiveMsg.className = 'msg msg-assistant proactive-greeting';
        proactiveMsg.setAttribute('role', 'status');
        const proactiveBubble = document.createElement('div');
        proactiveBubble.className = 'epir-message__bubble';
        proactiveBubble.innerHTML = `<strong>👋 Cześć!</strong> Widzę, że przeglądasz naszą kolekcję. Mogę Ci w czymś pomóc?`;
        proactiveMsg.appendChild(proactiveBubble);
        messagesEl.appendChild(proactiveMsg);
        
        // Scroll to show new message
        messagesEl.scrollTop = messagesEl.scrollHeight;
      }
    });

    initConsentGateForSection(section);
  } catch (e) {
    console.warn('Assistant init error', e);
  }
}

function initAllAssistantSections() {
  const sectionBlock = document.getElementById('epir-assistant-section');
  const sectionEmbed = document.getElementById('epir-assistant-embed');

  if (sectionBlock && sectionEmbed) {
    sectionBlock.style.display = 'none';
    sectionBlock.setAttribute('data-assistant-disabled-duplicate', 'true');
  }

  const sections = [sectionEmbed || sectionBlock].filter(Boolean);
  sections.forEach(function(section) {
    initAssistantUIForSection(section);
  });
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', initAllAssistantSections, { once: true });
} else {
  initAllAssistantSections();
}

// Retry when DOM might load late (e.g. Shopify app blocks)
if (typeof MutationObserver !== 'undefined') {
  var observerTimeout = 8000;
  var observerStart = Date.now();
  const observer = new MutationObserver(function() {
    if (Date.now() - observerStart > observerTimeout) {
      observer.disconnect();
      return;
    }
    const section = getAssistantSection();
    if (section && !section.dataset.assistantUiInit) {
      initAllAssistantSections();
    }
  });
  function startObserving() {
    if (document.body) {
      observer.observe(document.body, { childList: true, subtree: true });
    }
  }
  if (document.body) {
    startObserving();
  } else {
    document.addEventListener('DOMContentLoaded', startObserving);
  }
}

/* Typy - usunięte dla kompatybilności z przeglądarką (TypeScript → JavaScript) */
// type MessageElement = { id; el };
// type StreamPayload = { content?; delta?; session_id?; error?; done? };

/* Pomocnicze UI */
/** Jedna bańka treści wewnątrz `.msg.msg-assistant` — zapobiega rozbiciu flexa na wiele itemów (tekst + strong). */
function ensureAssistantBubble(msgRoot) {
  var direct = null;
  if (msgRoot.children && msgRoot.children.length) {
    for (var i = 0; i < msgRoot.children.length; i++) {
      if (msgRoot.children[i].classList && msgRoot.children[i].classList.contains('epir-message__bubble')) {
        direct = msgRoot.children[i];
        break;
      }
    }
  }
  if (direct) return direct;
  var bubble = document.createElement('div');
  bubble.className = 'epir-message__bubble';
  while (msgRoot.firstChild) {
    bubble.appendChild(msgRoot.firstChild);
  }
  msgRoot.appendChild(bubble);
  return bubble;
}

function createAssistantMessage(messagesEl) {
  const id = `msg-${Date.now()}-${Math.floor(Math.random() * 10000)}`;
  const div = document.createElement('div');
  div.className = 'msg msg-assistant msg-typing';
  div.id = id;
  div.setAttribute('role', 'status');
  const bubble = document.createElement('div');
  bubble.className = 'epir-message__bubble';
  bubble.textContent = '...';
  div.appendChild(bubble);
  messagesEl.appendChild(div);
  messagesEl.scrollTop = messagesEl.scrollHeight;
  return { id, el: div };
}

/** Bezpieczne **pogrubienie** w treści asystenta (bez pełnego Markdown). */
function formatAssistantMarkdownLite(text) {
  if (!text || typeof text !== 'string') return '';
  var esc = text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
  return esc.replace(/\*\*([\s\S]+?)\*\*/g, '<strong>$1</strong>');
}

function updateAssistantMessage(id, text) {
  const el = document.getElementById(id);
  if (!el) return;
  if (el.classList.contains('msg-assistant')) {
    const bubble = ensureAssistantBubble(el);
    bubble.innerHTML = formatAssistantMarkdownLite(text);
  } else {
    el.textContent = text;
  }
  const parent = el.parentElement;
  if (parent) parent.scrollTop = parent.scrollHeight;
}

function finalizeAssistantMessage(id) {
  const el = document.getElementById(id);
  if (!el) return;
  el.classList.remove('msg-typing');
  // accessibility: usuń aria-busy jeśli ustawione, pozostaw role=status
  el.removeAttribute('aria-busy');
  el.setAttribute('role', 'status');
}

function createUserMessage(messagesEl, text, attachment) {
  const div = document.createElement('div');
  div.className = 'msg msg-user';
  const hasAttachment = Boolean(attachment && attachment.data);
  if (hasAttachment) {
    div.classList.add('msg-user--with-attachment');
    const img = document.createElement('img');
    img.className = 'msg-user-attachment__img';
    img.loading = 'lazy';
    img.src = 'data:' + (attachment.mediaType || 'image/jpeg') + ';base64,' + attachment.data;
    img.alt = attachment.fileName
      ? 'Załączone zdjęcie: ' + attachment.fileName
      : 'Załączone zdjęcie użytkownika';
    div.appendChild(img);
    if (text && String(text).trim()) {
      const textEl = document.createElement('span');
      textEl.className = 'msg-user-attachment__text';
      textEl.textContent = text;
      div.appendChild(textEl);
    }
  } else {
    div.textContent = text;
  }
  messagesEl.appendChild(div);
  messagesEl.scrollTop = messagesEl.scrollHeight;
}

/* Robustny parser SSE/JSONL z obsługą delta (nowy) i content (fallback) */
async function processSSEStream(
  body,
  msgId,
  sessionIdKey,
  onUpdate
) {
  const reader = body.getReader();
  const decoder = new TextDecoder('utf-8');
  let buffer = '';
  let accumulated = '';

  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });

      // Procesuj pełne eventy (oddzielone pustą linią)
      let index;
      while ((index = buffer.indexOf('\n\n')) !== -1) {
        const rawEvent = buffer.slice(0, index);
        buffer = buffer.slice(index + 2);

        // Złóż wszystkie linie 'data:' w rawEvent
        const lines = rawEvent.split(/\r?\n/);
        const dataLines = lines.filter((l) => l.startsWith('data:')).map((l) => l.slice(5));
        const dataStr = dataLines.join('\n').trim();
        if (!dataStr) continue;

        if (dataStr === '[DONE]') return;

        let parsed;
        try {
          parsed = JSON.parse(dataStr);
        } catch (e) {
          console.error('SSE JSON parse error', e, dataStr);
              reportUiExtensionError(e, { stage: 'parse_sse', stream_chunk: dataStr.slice(0, 500) });
          throw new Error('Błąd komunikacji: otrzymano nieprawidłowe dane strumienia.');
        }

        if (parsed.error) throw new Error(parsed.error);

        if (parsed.session_id) {
          try { sessionStorage.setItem(sessionIdKey, parsed.session_id); } catch (e) { /* silent */ }
        }

        // Obsługa natywnych tool_calls (status)
        if (parsed.tool_call) {
          const calls = Array.isArray(parsed.tool_call) ? parsed.tool_call : [parsed.tool_call];
          const names = calls.map((c) => c.name || c.id || 'narzędzie').join(', ');
          const statusMsg = `Wywołuję narzędzie: ${names}...`;
          onUpdate(statusMsg, parsed);
          continue;
        }

        // Nowa obsługa: delta (incremental) lub content (full replacement)
        if (parsed.delta !== undefined) {
          accumulated += parsed.delta;
          onUpdate(accumulated, parsed);
        } else if (parsed.content !== undefined) {
          accumulated = parsed.content;
          onUpdate(accumulated, parsed);
        }

        if (parsed.done) return;
      }
    }

    // Po zakończeniu odczytu: spróbuj przetworzyć pozostałości w bufferze
    if (buffer.trim()) {
      const lines = buffer.split(/\r?\n/);
      const dataLines = lines.filter((l) => l.startsWith('data:')).map((l) => l.slice(5));
      const dataStr = dataLines.join('\n').trim();
      if (dataStr && dataStr !== '[DONE]') {
        try {
          const parsed = JSON.parse(dataStr);
          if (parsed.session_id) try { sessionStorage.setItem(sessionIdKey, parsed.session_id); } catch {}
          if (parsed.tool_call) {
            const calls = Array.isArray(parsed.tool_call) ? parsed.tool_call : [parsed.tool_call];
            const names = calls.map((c) => c.name || c.id || 'narzędzie').join(', ');
            const statusMsg = `Wywołuję narzędzie: ${names}...`;
            onUpdate(statusMsg, parsed);
          } else if (parsed.delta !== undefined) {
            accumulated += parsed.delta;
            onUpdate(accumulated, parsed);
          } else if (parsed.content !== undefined) {
            accumulated = parsed.content;
            onUpdate(accumulated, parsed);
          }
        } catch (e) {
          console.warn('Nieparsowalny ostatni event SSE', e);
        }
      }
    }
  } finally {
    try { reader.releaseLock(); } catch {}
  }
}

/* Główna funkcja wysyłki z fallbackiem JSON */
async function sendMessageToWorker(
  text,
  endpoint,
  sessionIdKey,
  messagesEl,
  setLoading,
  controller,
  attachment
) {
  // Small UX helpers: global loader below messages (block or embed)
  const globalLoader = document.getElementById('assistant-loader') || document.getElementById('assistant-loader-embed');
  const showGlobalLoader = () => { try { if (globalLoader) globalLoader.style.display = 'flex'; } catch {}
  };
  const hideGlobalLoader = () => { try { if (globalLoader) globalLoader.style.display = 'none'; } catch {}
  };

  // Render mode: 'growing' (default) or 'dots' (keeps '...' until finish)
  const sectionEl = (messagesEl && (messagesEl.closest('#epir-assistant-embed') || messagesEl.closest('#epir-assistant-section'))) || getAssistantSection();
  const renderMode = (sectionEl && sectionEl.dataset && sectionEl.dataset.streamRender) || 'growing';

  setLoading(true);
  showGlobalLoader();
  createUserMessage(messagesEl, text || EPIR_IMAGE_ATTACHMENT_PLACEHOLDER, attachment);
  persistAssistantTranscriptFromDom(sectionEl, messagesEl, sessionIdKey);
  const { id: msgId, el: msgEl } = createAssistantMessage(messagesEl);
  let accumulated = '';
  let lastParsedActions = null;
  // Perf metrics
  const tStart = (typeof performance !== 'undefined' && performance.now) ? performance.now() : Date.now();
  let firstChunkAt = null;
  let chunks = 0;

  try {
    // Pobierz cart_id z Shopify przed wysłaniem
    const cartId = await getShopifyCartId();
    console.log('[Assistant] Cart ID:', cartId);
    
    const brand = (sectionEl && sectionEl.dataset && sectionEl.dataset.brand) || 'epir';
    const storefrontId = (sectionEl && sectionEl.dataset && sectionEl.dataset.storefrontId) || '';
    const channel = (sectionEl && sectionEl.dataset && sectionEl.dataset.channel) || '';
    const parts = [];
    if (text && String(text).trim()) {
      parts.push({ type: 'text', text: String(text).trim() });
    }
    if (attachment && attachment.data) {
      parts.push({
        type: 'file',
        data: attachment.data,
        mediaType: attachment.mediaType || 'image/jpeg',
      });
    }
    const body = {
      storefrontId: storefrontId,
      channel: channel,
      message: (text && String(text).trim()) || (attachment ? '' : ''),
      session_id: (() => { try { return sessionStorage.getItem(sessionIdKey); } catch { return null; } })(),
      cart_id: cartId,
      brand,
      stream: true,
    };
    if (parts.length > 0) {
      body.parts = parts;
    }
    const res = await fetch(endpoint, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Accept: 'text/event-stream, application/json',
      },
      credentials: 'include',
      body: JSON.stringify(body),
      signal: controller.signal,
    });

    if (!res.ok) {
      const errText = await (async () => { try { return await res.text(); } catch { return ''; } })();
      console.error('Server error:', res.status, errText);
      throw new Error(`Serwer zwrócił błąd (${res.status}).`);
    }

    const contentType = res.headers.get('content-type') || '';
    const hasStreamAPI = res.body && typeof (res.body).getReader === 'function';

    if (hasStreamAPI && contentType.includes('text/event-stream')) {
      // streaming SSE
      await processSSEStream(res.body, msgId, sessionIdKey, (content, parsed) => {
        accumulated = content;
        chunks += 1;
        if (!firstChunkAt) {
          firstChunkAt = (typeof performance !== 'undefined' && performance.now) ? performance.now() : Date.now();
        }
        
        // Parsuj odpowiedź i wykryj akcje (checkout URL, cart updates)
        const { text: cleanedText, actions } = parseAssistantResponse(accumulated);
        if (renderMode === 'growing') {
          updateAssistantMessage(msgId, cleanedText);
        } // in 'dots' mode we keep the initial '...' until stream completes
        
        // Zapisz akcje do renderowania po zakończeniu streamu
        if (actions.hasCheckoutUrl || actions.hasCartUpdate || actions.hasOrderStatus) {
          lastParsedActions = actions;
        }
      });
    } else if (hasStreamAPI && contentType.includes('application/ndjson')) {
      // ewentualne inne formy newline-delimited json - można dodać parser
      await processSSEStream(res.body, msgId, sessionIdKey, (content, parsed) => {
        accumulated = content;
        chunks += 1;
        if (!firstChunkAt) {
          firstChunkAt = (typeof performance !== 'undefined' && performance.now) ? performance.now() : Date.now();
        }
        const { text: cleanedText, actions } = parseAssistantResponse(accumulated);
        if (renderMode === 'growing') {
          updateAssistantMessage(msgId, cleanedText);
        }
        if (actions.hasCheckoutUrl || actions.hasCartUpdate || actions.hasOrderStatus) {
          lastParsedActions = actions;
        }
      });
    } else {
      // fallback JSON (serwer buforuje / starsze przeglądarki)
      const data = await res.json().catch((e) => { throw new Error('Nieprawidłowa odpowiedź serwera.'); });
      if (data.error) throw new Error(data.error);
      accumulated = (data.reply) || 'Otrzymano pustą odpowiedź.';
      
      // Parsuj odpowiedź w trybie non-streaming
      const { text: cleanedText, actions } = parseAssistantResponse(accumulated);
      updateAssistantMessage(msgId, cleanedText);
      if (actions.hasCheckoutUrl || actions.hasCartUpdate || actions.hasOrderStatus) {
        lastParsedActions = actions;
      }
      
      if (data.session_id) {
        try { sessionStorage.setItem(sessionIdKey, data.session_id); } catch {}
      }
    }
    
    // Po zakończeniu streamu: uzupełnij treść w trybie 'dots', renderuj akcje (checkout button, cart status)
      const msgElement = document.getElementById(msgId);
      if (renderMode === 'dots') {
        let finalText = '';
        if (accumulated) {
          const { text } = parseAssistantResponse(accumulated);
          finalText = text;
        } else {
          finalText = 'Brak wyników, spróbuj innego zapytania.';
        }
        updateAssistantMessage(msgId, finalText);
      }
      if (lastParsedActions && msgElement) {
        if (lastParsedActions.hasCheckoutUrl && lastParsedActions.checkoutUrl) {
          console.log('[Assistant] Rendering checkout button:', lastParsedActions.checkoutUrl);
          renderCheckoutButton(lastParsedActions.checkoutUrl, msgElement);
        }
        if (lastParsedActions.hasCartUpdate) {
          console.log('[Assistant] Cart was updated');
          try {
            document.dispatchEvent(new CustomEvent('cart:refresh'));
          } catch (e) {
            console.warn('Failed to dispatch cart:refresh event', e);
          }
        }
        if (lastParsedActions.hasOrderStatus && lastParsedActions.orderDetails) {
          console.log('[Assistant] Order status:', lastParsedActions.orderDetails);
          // Można dodać rendering szczegółów zamówienia
        }
      }
      persistAssistantTranscriptFromDom(sectionEl, messagesEl, sessionIdKey);
  } catch (err) {
    console.error('Błąd czatu:', err);
    reportUiExtensionError(err, {
      stage: 'chat_execution',
      user_message_len: text.length,
      render_mode: renderMode,
    });
    const safeMsg = err instanceof Error ? err.message : 'Nieznany błąd.';
    const finalText = accumulated.length > 0 ? `${accumulated} (Błąd: ${safeMsg})` : 'Przepraszam, wystąpił błąd. Spróbuj ponownie.';
    updateAssistantMessage(msgId, finalText);
    const el = document.getElementById(msgId);
    if (el) el.classList.add('msg-error');
    persistAssistantTranscriptFromDom(sectionEl, messagesEl, sessionIdKey);
  } finally {
    finalizeAssistantMessage(msgId);
    setLoading(false);
    hideGlobalLoader();
    // Perf summary
    const tEnd = (typeof performance !== 'undefined' && performance.now) ? performance.now() : Date.now();
    const ttfb = firstChunkAt ? Math.round(firstChunkAt - tStart) : null;
    const total = Math.round(tEnd - tStart);
    const avgChunkMs = chunks > 0 ? Math.round((tEnd - (firstChunkAt || tStart)) / Math.max(1, chunks)) : null;
    console.log('[Assistant][Perf]', {
      messageLen: text.length,
      chunks,
      timeToFirstChunkMs: ttfb,
      totalMs: total,
      avgChunkMs,
      renderMode,
    });
  }
}

// Kod ładowany bezpośrednio w przeglądarce - brak eksportów

// Event delegation: works even when form loads after DOMContentLoaded (Shopify app blocks)
function initAssistantSubmitHandler() {
  if (document.body && document.body.dataset.assistantSubmitDelegation === '1') return;
  if (document.body) document.body.dataset.assistantSubmitDelegation = '1';

  document.addEventListener('click', function(e) {
    const btn = e.target && (e.target.closest('#assistant-send-button') || e.target.closest('#assistant-send-button-embed'));
    if (!btn) return;
    e.preventDefault();
    const form = btn.closest('form') || document.querySelector('#assistant-form') || document.querySelector('#assistant-form-embed');
    const input = form && (form.querySelector('#assistant-input') || form.querySelector('#assistant-input-embed'));
    if (form && input) doSendFromForm(form, input);
  }, true);

  document.addEventListener('keydown', function(e) {
    if (e.key !== 'Enter' || e.shiftKey) return;
    const input = e.target && (e.target.matches('#assistant-input') || e.target.matches('#assistant-input-embed')) ? e.target : null;
    if (!input) return;
    const form = input.closest('form') || document.querySelector('#assistant-form') || document.querySelector('#assistant-form-embed');
    if (form) {
      e.preventDefault();
      doSendFromForm(form, input);
    }
  }, true);

  document.addEventListener('submit', function(e) {
    const form = e.target;
    if (form && (form.id === 'assistant-form' || form.id === 'assistant-form-embed')) {
      e.preventDefault();
      e.stopPropagation();
      const input = form.querySelector('#assistant-input') || form.querySelector('#assistant-input-embed');
      if (input) doSendFromForm(form, input);
      return false;
    }
  }, true);
}

function doSendFromForm(form, input) {
  const sectionEl = form.closest('#epir-assistant-embed') || form.closest('#epir-assistant-section') || getAssistantSection();
  if (sectionEl && sectionEl.classList.contains('epir-assistant--consent-locked')) {
    return;
  }
  const messagesEl = sectionEl && (sectionEl.querySelector('#assistant-messages') || sectionEl.querySelector('#assistant-messages-embed'));
  const text = (input && input.value && input.value.trim()) || '';
  const pendingAttachment = getPendingAttachment(form);
  if ((!text && !pendingAttachment) || !messagesEl) return;
  input.value = '';
  const controller = new AbortController();
  const setLoading = function(b) {
    if (!messagesEl) return;
    if (b) messagesEl.classList.add('is-loading'); else messagesEl.classList.remove('is-loading');
  };
  (async function() {
    try {
      let endpoint = normalizeAssistantEndpoint();
      const shop = (sectionEl && sectionEl.dataset && sectionEl.dataset.shopDomain) || '';
      const customerId = resolveLoggedInCustomerId(sectionEl) || '';
      if (shop || customerId) {
        const params = new URLSearchParams();
        if (shop) params.set('shop', shop);
        if (customerId) params.set('logged_in_customer_id', customerId);
        endpoint = endpoint + (endpoint.includes('?') ? '&' : '?') + params.toString();
      }
      var attachmentSnap = pendingAttachment;
      setPendingAttachment(form, null);
      // Reset visual indicator on attach button(s) when attachment is consumed
      form.querySelectorAll('.assistant-attach-btn--active').forEach(function(btn) {
        btn.classList.remove('assistant-attach-btn--active');
        btn.title = '';
      });
      await sendMessageToWorker(text, endpoint, 'epir-assistant-session', messagesEl, setLoading, controller, attachmentSnap);
    } catch (err) {
      console.error('Fetch error:', err);
    }
  })();
}

function initAssistantFileControlsDeferred() {
  ensureAssistantFileControls();
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', function () {
    initAssistantSubmitHandler();
    initAssistantFileControlsDeferred();
  }, { once: true });
} else {
  initAssistantSubmitHandler();
  initAssistantFileControlsDeferred();
}
