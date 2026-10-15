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
