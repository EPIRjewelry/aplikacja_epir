window.__EPIR_ASSISTANT_RUNTIME_LOADED__=true;
// Przywrócona wersja z backupu (UTF-8, poprawne polskie znaki)
// extensions/asystent-klienta/assets/assistant.js
// Shopify canonical storefront ingress: always use App Proxy endpoint.
var EPIR_CHAT_WORKER_ENDPOINT = '/apps/assistant/chat';
/** Ostatnio wybrany obraz, izolowany per formularz czatu. */
var epirPendingAttachmentByForm = new WeakMap();
/** Maksymalny rozmiar załącznika obrazu (4 MB po stronie klienta przed base64). */
const EPIR_MAX_ATTACH_BYTES = 4 * 1024 * 1024;

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
    const publish = typeof Shopify !== 'undefined' && Shopify?.analytics && typeof Shopify.analytics.publish === 'function'
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

// Minimal initializer: bind toggle button to open/close the assistant (supports block + embed)
function initAssistantUIForSection(section) {
  if (!section || section.dataset.assistantUiInit === '1') return;
  try {
    teleportAssistantToBody(section);
    const launcher = section.querySelector('#assistant-launcher') || section.querySelector('#assistant-launcher-embed');
    const closeBtn = section.querySelector('#assistant-close-button') || section.querySelector('#assistant-close-button-embed');
    const content = section.querySelector('#assistant-content') || section.querySelector('#assistant-content-embed');
    if (!content) return;

    const inline =
      section.dataset.inlineAssistant === '1' ||
      (section.id === 'epir-assistant-section' && !launcher);

    if (inline) {
      content.classList.remove('is-closed');
      section.dataset.assistantUiInit = '1';
    } else {
      if (!launcher || !closeBtn) return;
      section.dataset.assistantUiInit = '1';

      launcher.addEventListener('click', (e) => {
        e.preventDefault();
        if (content) {
          content.classList.remove('is-closed');
          launcher.setAttribute('aria-expanded', 'true');
        }
      });

      closeBtn.addEventListener('click', (e) => {
        e.preventDefault();
        if (content) {
          content.classList.add('is-closed');
          launcher.setAttribute('aria-expanded', 'false');
        }
      });
    }

    // --- Powitanie klienta imieniem z localStorage/sessionStorage ---
    const messagesEl = section.querySelector('#assistant-messages') || section.querySelector('#assistant-messages-embed');
    let localName = null;
    try {
      localName = localStorage.getItem('epir_customer_name') || sessionStorage.getItem('epir_customer_name');
    } catch {}
    const loggedInCustomerId = section.dataset.loggedInCustomerId || '';
    if (localName && !loggedInCustomerId && messagesEl) {
      // Dodaj powitanie z imieniem tylko dla lokalnie rozpoznanego klienta
      const welcomeDiv = document.createElement('div');
      welcomeDiv.className = 'msg msg-assistant welcome-message';
      welcomeDiv.setAttribute('role', 'status');
      welcomeDiv.textContent = `Witaj ponownie, ${localName}! Miło Cię widzieć.`;
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
      
      // Auto-open chat if closed
      if (content && content.classList.contains('is-closed')) {
        content.classList.remove('is-closed');
        if (launcher) launcher.setAttribute('aria-expanded', 'true');
        console.log('[EPIR Assistant] ✅ Chat opened proactively');
      }
      
      // Optional: Add proactive greeting message
      if (messagesEl && event.detail?.reason) {
        const proactiveMsg = document.createElement('div');
        proactiveMsg.className = 'msg msg-assistant proactive-greeting';
        proactiveMsg.setAttribute('role', 'status');
        proactiveMsg.innerHTML = `<strong>👋 Cześć!</strong> Widzę, że przeglądasz naszą kolekcję. Mogę Ci w czymś pomóc?`;
        messagesEl.appendChild(proactiveMsg);
        
        // Scroll to show new message
        messagesEl.scrollTop = messagesEl.scrollHeight;
      }
    });
  } catch (e) {
    console.warn('Assistant init error', e);
  }
}

function initAllAssistantSections() {
  const sectionBlock = document.getElementById('epir-assistant-section');
  const sectionEmbed = document.getElementById('epir-assistant-embed');

  // Prevent duplicate UIs when both block and embed are enabled.
  // Embed is preferred because it is global and consistent across pages.
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
function createAssistantMessage(messagesEl) {
  const id = `msg-${Date.now()}-${Math.floor(Math.random() * 10000)}`;
  const div = document.createElement('div');
  div.className = 'msg msg-assistant msg-typing';
  div.id = id;
  div.setAttribute('role', 'status');
  div.textContent = '...';
  messagesEl.appendChild(div);
  messagesEl.scrollTop = messagesEl.scrollHeight;
  return { id, el: div };
}

function updateAssistantMessage(id, text) {
  const el = document.getElementById(id);
  if (!el) return;
  el.textContent = text;
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

function createUserMessage(messagesEl, text) {
  const div = document.createElement('div');
  div.className = 'msg msg-user';
  div.textContent = text;
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
  createUserMessage(messagesEl, text || '(załącznik obrazu)');
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
      const customerId = (sectionEl && sectionEl.dataset && sectionEl.dataset.loggedInCustomerId) || '';
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
