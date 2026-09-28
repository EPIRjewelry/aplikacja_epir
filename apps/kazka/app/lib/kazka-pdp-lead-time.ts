const LEAD_TIME_METAFIELD_KEY = 'czas_wykonania';
const LEAD_TAG_RE = /(?:^|\b)(3|10)[\s_-]*dni(?:owa|owe)?/i;
const LEAD_TEXT_RE = /(?:^|\b)(3|10)[\s_-]*dni(?:owa|owe)?/i;

/** Linie konceptu — nie źródło czasu wykonania. */
const LINIA_HANDLE_MARKERS = [
  'kazka-classic',
  'kazka-big-lab',
  'kazka-fancy-cut',
  'kazka-kamienie',
  'kazka-szafiry',
  'kazka-rubiny',
  'kazka-szmaragdy',
];

export type LeadTimeSource =
  | 'metafield'
  | 'tag'
  | 'title'
  | 'handle'
  | 'missing'
  | 'conflict';

export type LeadTimeResult = {
  days: 3 | 10 | null;
  source: LeadTimeSource;
  conflict?: boolean;
};

function parseLeadDaysFromText(text: string): 3 | 10 | null {
  const m = text.match(LEAD_TEXT_RE);
  if (!m) return null;
  const d = Number(m[1]);
  return d === 3 || d === 10 ? d : null;
}

function isLiniaMarketingText(text: string): boolean {
  const lower = text.toLowerCase();
  return LINIA_HANDLE_MARKERS.some((h) => lower.includes(h.replace('kazka-', '')));
}

export function resolveLeadTimeDays(product: {
  tags?: string[] | null;
  title?: string | null;
  handle?: string | null;
  czasWykonania?: {value?: string | null} | null;
}): LeadTimeResult {
  const fromMeta = product.czasWykonania?.value?.trim();
  if (fromMeta) {
    const n = Number.parseInt(fromMeta, 10);
    if (n === 3 || n === 10) {
      return {days: n, source: 'metafield'};
    }
  }

  const tagHits: Array<3 | 10> = [];
  for (const tag of product.tags ?? []) {
    const m = tag.match(LEAD_TAG_RE);
    if (m) {
      const d = Number(m[1]);
      if (d === 3 || d === 10) tagHits.push(d);
    }
  }
  const uniqueTags = [...new Set(tagHits)];
  if (uniqueTags.length === 1) {
    return {days: uniqueTags[0], source: 'tag'};
  }
  if (uniqueTags.length > 1) {
    return {days: null, source: 'conflict', conflict: true};
  }

  const title = product.title ?? '';
  const handle = product.handle ?? '';
  if (!isLiniaMarketingText(`${title} ${handle}`)) {
    const fromTitle = parseLeadDaysFromText(title);
    if (fromTitle) return {days: fromTitle, source: 'title'};
    const fromHandle = parseLeadDaysFromText(handle.replace(/-/g, ' '));
    if (fromHandle) return {days: fromHandle, source: 'handle'};
  }

  return {days: null, source: 'missing'};
}

export function formatLeadTimePhrase(days: 3 | 10 | null): string | null {
  if (days === 3) return 'Wykonanie 3 dni robocze';
  if (days === 10) return 'Wykonanie 10 dni roboczych';
  return 'Wykonanie';
}

export {LEAD_TIME_METAFIELD_KEY};
