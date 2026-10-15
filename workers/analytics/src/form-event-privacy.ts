/** Query keys kept on pixel_events.page_url (attribution). Everything else is dropped. */
const PAGE_URL_ATTRIBUTION_KEYS = [
  'utm_source',
  'utm_medium',
  'utm_campaign',
  'utm_content',
  'utm_term',
  'gclid',
  'fbclid',
  'ttclid',
  'msclkid',
] as const;

const FORM_FIELD_EVENT_TYPES = new Set([
  'form_submitted',
  'input_focused',
  'input_blurred',
  'input_changed',
]);

export function actionWithoutQuery(action: string): string {
  try {
    const absolute = action.includes('://');
    const u = absolute ? new URL(action) : new URL(action, 'https://epir.local');
    return absolute ? `${u.origin}${u.pathname}` : u.pathname;
  } catch {
    return action.split('?')[0]?.split('#')[0] ?? action;
  }
}

/** origin + pathname, plus UTM / click-id query only. Relative input stays a path. */
export function canonicalAnalyticsPageUrl(raw: string | null | undefined): string | null {
  if (!raw || typeof raw !== 'string') return null;
  const trimmed = raw.trim();
  if (!trimmed) return null;
  try {
    const absolute = trimmed.includes('://');
    const u = absolute ? new URL(trimmed) : new URL(trimmed, 'https://epir.local');
    const keep = new URLSearchParams();
    for (const key of PAGE_URL_ATTRIBUTION_KEYS) {
      const value = u.searchParams.get(key);
      if (value) keep.append(key, value);
    }
    const qs = keep.toString();
    const path = `${u.pathname}${qs ? `?${qs}` : ''}`;
    if (!absolute) return path;
    return `${u.origin}${path}`;
  } catch {
    const cut = trimmed.split('?')[0]?.split('#')[0];
    return cut || null;
  }
}

export function formElementRecord(data: Record<string, unknown>): Record<string, unknown> | null {
  if (data.element && typeof data.element === 'object') {
    return data.element as Record<string, unknown>;
  }
  if (data.data && typeof data.data === 'object') {
    const nested = (data.data as Record<string, unknown>).element;
    if (nested && typeof nested === 'object') return nested as Record<string, unknown>;
  }
  return null;
}

function redactFormHolder(eventType: string, holder: Record<string, unknown>): void {
  const element = holder.element;
  if (!element || typeof element !== 'object') return;
  const el = element as Record<string, unknown>;
  if (eventType === 'form_submitted') {
    const next: Record<string, unknown> = {};
    if (typeof el.id === 'string') next.id = el.id;
    if (typeof el.action === 'string') next.action = actionWithoutQuery(el.action);
    holder.element = next;
    return;
  }
  delete el.value;
  if (Array.isArray(el.elements)) {
    el.elements = el.elements.map((item) => {
      if (!item || typeof item !== 'object') return item;
      const copy = {...(item as Record<string, unknown>)};
      delete copy.value;
      return copy;
    });
  }
}

function queryFromPageUrl(pageUrl: string): string {
  const q = pageUrl.indexOf('?');
  if (q === -1) return '';
  return pageUrl.slice(q);
}

function rewriteLocation(loc: Record<string, unknown>, pageUrl: string): Record<string, unknown> {
  return {
    ...loc,
    href: pageUrl,
    search: queryFromPageUrl(pageUrl),
    hash: '',
  };
}

/** href/search/hash na document i window oraz referrer — tylko kanoniczny adres (UTM/click-id). */
export function withCanonicalPageLocation(eventData: unknown, pageUrl: string | null): unknown {
  if (!pageUrl || !eventData || typeof eventData !== 'object') return eventData;
  const rec = eventData as Record<string, unknown>;
  const ctx = rec.context;
  if (!ctx || typeof ctx !== 'object') return eventData;
  const ctxRec = ctx as Record<string, unknown>;

  let documentOut: Record<string, unknown> | undefined;
  const doc = ctxRec.document;
  if (doc && typeof doc === 'object') {
    const docRec = doc as Record<string, unknown>;
    documentOut = {...docRec};
    const loc = docRec.location;
    if (loc && typeof loc === 'object') {
      documentOut.location = rewriteLocation(loc as Record<string, unknown>, pageUrl);
    }
    if (typeof docRec.referrer === 'string') {
      const referrer = canonicalAnalyticsPageUrl(docRec.referrer);
      if (referrer) documentOut.referrer = referrer;
    }
  }

  let windowOut: Record<string, unknown> | undefined;
  const win = ctxRec.window;
  if (win && typeof win === 'object') {
    const winRec = win as Record<string, unknown>;
    const loc = winRec.location;
    if (loc && typeof loc === 'object') {
      windowOut = {
        ...winRec,
        location: rewriteLocation(loc as Record<string, unknown>, pageUrl),
      };
    }
  }

  if (!documentOut && !windowOut) return eventData;
  return {
    ...rec,
    context: {
      ...ctxRec,
      ...(documentOut ? {document: documentOut} : {}),
      ...(windowOut ? {window: windowOut} : {}),
    },
  };
}

/** Second line of defense before raw_data INSERT. */
export function sanitizeFormEventData(eventType: string, eventData: unknown): unknown {
  if (!FORM_FIELD_EVENT_TYPES.has(eventType) || !eventData || typeof eventData !== 'object') {
    return eventData;
  }
  let clone: Record<string, unknown>;
  try {
    clone = JSON.parse(JSON.stringify(eventData)) as Record<string, unknown>;
  } catch {
    return eventData;
  }
  redactFormHolder(eventType, clone);
  if (clone.data && typeof clone.data === 'object') {
    redactFormHolder(eventType, clone.data as Record<string, unknown>);
  }
  return clone;
}

/**
 * Shopify Web Pixels standard events z obiektem `checkout` (shopify.dev → web-pixels-api/standard-events).
 * Do D1 trafia tylko biała lista pól poniżej; e-mail, telefon, adresy, atrybuty i properties pozycji nigdy.
 */
const CHECKOUT_EVENT_TYPES = new Set([
  'checkout_started',
  'checkout_contact_info_submitted',
  'checkout_address_info_submitted',
  'checkout_shipping_info_submitted',
  'payment_info_submitted',
  'checkout_completed',
]);

type Rec = Record<string, unknown>;

function isRec(value: unknown): value is Rec {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function pickScalars(src: Rec, keys: readonly string[]): Rec {
  const out: Rec = {};
  for (const key of keys) {
    const v = src[key];
    if (v === null || typeof v === 'string' || typeof v === 'number' || typeof v === 'boolean') {
      out[key] = v;
    }
  }
  return out;
}

function pickMoney(value: unknown): Rec | undefined {
  return isRec(value) ? pickScalars(value, ['amount', 'currencyCode']) : undefined;
}

function setIf(out: Rec, key: string, value: unknown): void {
  if (value !== undefined) out[key] = value;
}

function pickArray(value: unknown, pick: (item: Rec) => Rec): Rec[] | undefined {
  return Array.isArray(value) ? value.filter(isRec).map(pick) : undefined;
}

function pickProduct(p: Rec): Rec {
  return pickScalars(p, ['id', 'title', 'type', 'vendor', 'url']);
}

function pickVariant(v: Rec): Rec {
  const out = pickScalars(v, ['id', 'title', 'sku']);
  setIf(out, 'price', pickMoney(v.price));
  if (isRec(v.product)) out.product = pickProduct(v.product);
  return out;
}

function pickLineItem(li: Rec): Rec {
  const out = pickScalars(li, ['id', 'quantity', 'title']);
  setIf(out, 'finalLinePrice', pickMoney(li.finalLinePrice));
  if (isRec(li.variant)) out.variant = pickVariant(li.variant);
  return out;
}

function pickDiscountApplication(d: Rec): Rec {
  const out = pickScalars(d, ['type', 'title', 'allocationMethod', 'targetSelection', 'targetType']);
  if (isRec(d.value)) out.value = pickScalars(d.value, ['amount', 'currencyCode', 'percentage']);
  return out;
}

function pickDeliveryOption(o: Rec): Rec {
  const out = pickScalars(o, ['type', 'title']);
  setIf(out, 'cost', pickMoney(o.cost));
  setIf(out, 'costAfterDiscounts', pickMoney(o.costAfterDiscounts));
  return out;
}

function pickTransaction(t: Rec): Rec {
  const out = pickScalars(t, ['gateway']);
  setIf(out, 'amount', pickMoney(t.amount));
  if (isRec(t.paymentMethod)) out.paymentMethod = pickScalars(t.paymentMethod, ['type', 'name']);
  return out;
}

export function allowlistCheckout(checkout: Rec): Rec {
  const out = pickScalars(checkout, ['token', 'currencyCode']);
  for (const key of ['totalPrice', 'subtotalPrice', 'totalTax', 'discountsAmount']) {
    setIf(out, key, pickMoney(checkout[key]));
  }
  setIf(out, 'lineItems', pickArray(checkout.lineItems, pickLineItem));
  setIf(out, 'discountApplications', pickArray(checkout.discountApplications, pickDiscountApplication));
  if (isRec(checkout.shippingLine)) {
    out.shippingLine = {};
    setIf(out.shippingLine as Rec, 'price', pickMoney(checkout.shippingLine.price));
  }
  if (isRec(checkout.delivery)) {
    out.delivery = {};
    setIf(out.delivery as Rec, 'selectedDeliveryOptions', pickArray(checkout.delivery.selectedDeliveryOptions, pickDeliveryOption));
  }
  if (isRec(checkout.localization)) {
    const l = checkout.localization;
    const loc: Rec = {};
    if (isRec(l.country)) loc.country = pickScalars(l.country, ['isoCode']);
    if (isRec(l.language)) loc.language = pickScalars(l.language, ['isoCode']);
    if (isRec(l.market)) loc.market = pickScalars(l.market, ['id', 'handle']);
    out.localization = loc;
  }
  if (isRec(checkout.order)) {
    const order = pickScalars(checkout.order, ['id']);
    if (isRec(checkout.order.customer)) order.customer = pickScalars(checkout.order.customer, ['isFirstOrder']);
    out.order = order;
  }
  setIf(out, 'transactions', pickArray(checkout.transactions, pickTransaction));
  return out;
}

function allowlistAlert(alert: Rec): Rec {
  return pickScalars(alert, ['type', 'message', 'target']);
}

function allowlistCommerceHolder(eventType: string, holder: Rec): void {
  if (CHECKOUT_EVENT_TYPES.has(eventType) && 'checkout' in holder) {
    if (isRec(holder.checkout)) holder.checkout = allowlistCheckout(holder.checkout);
    else delete holder.checkout;
  }
  if (eventType === 'alert_displayed' && 'alert' in holder) {
    if (isRec(holder.alert)) holder.alert = allowlistAlert(holder.alert);
    else delete holder.alert;
  }
}

/** Formularze (bez wartości pól) + checkout/alert (biała lista). Jedyne wejście przed wysyłką / INSERT. */
export function sanitizePixelEventData(eventType: string, eventData: unknown): unknown {
  const formSafe = sanitizeFormEventData(eventType, eventData);
  const isCommerce = CHECKOUT_EVENT_TYPES.has(eventType) || eventType === 'alert_displayed';
  if (!isCommerce || !isRec(formSafe)) return formSafe;
  let clone: Rec;
  try {
    clone = JSON.parse(JSON.stringify(formSafe)) as Rec;
  } catch {
    return {};
  }
  allowlistCommerceHolder(eventType, clone);
  if (isRec(clone.data)) {
    // Shopify `event.data` ma tylko `checkout` albo `alert` — każdy inny klucz odpada.
    const key = eventType === 'alert_displayed' ? 'alert' : 'checkout';
    const inner = clone.data;
    clone.data = key in inner ? {[key]: inner[key]} : {};
    allowlistCommerceHolder(eventType, clone.data as Rec);
  }
  return clone;
}
