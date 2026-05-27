/**
 * EPIR Hybrid Attribution Mesh — deterministyczny rdzeń.
 */

export type AttributionData = {
  source: string | null;
  medium: string | null;
  campaign: string | null;
  content: string | null;
  term: string | null;
  clickId: string | null;
  clickIdType: string | null;
};

export const DIRECT_LIKE_SOURCES = new Set(['direct', 'unknown', '(direct)', 'none']);

export function normalizeAttributionToken(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const v = value.trim();
  return v.length > 0 ? v.toLowerCase() : null;
}

export function pickClickId(data: Record<string, unknown>): { clickId: string | null; clickIdType: string | null } {
  const keys = ['gclid', 'fbclid', 'ttclid', 'msclkid'] as const;
  for (const key of keys) {
    const value = normalizeAttributionToken(data[key]);
    if (value) return { clickId: value, clickIdType: key };
  }
  return { clickId: null, clickIdType: null };
}

export function inferAttributionFromReferrer(referrer: string | null): { source: string | null; medium: string | null } {
  if (!referrer) return { source: 'direct', medium: 'none' };
  const r = referrer.toLowerCase();
  if (r.includes('google.')) return { source: 'google', medium: 'organic' };
  if (r.includes('bing.')) return { source: 'bing', medium: 'organic' };
  if (r.includes('facebook.') || r.includes('fb.com')) return { source: 'facebook', medium: 'social' };
  if (r.includes('instagram.')) return { source: 'instagram', medium: 'social' };
  return { source: 'referral', medium: 'referral' };
}

export function isDirectLikeSource(source: string | null | undefined): boolean {
  if (!source) return true;
  return DIRECT_LIKE_SOURCES.has(source.toLowerCase());
}

export function resolveFromClickId(clickIdType: string | null): { source: string | null; medium: string | null } {
  switch (clickIdType) {
    case 'gclid':
      return { source: 'google', medium: 'cpc' };
    case 'fbclid':
      return { source: 'facebook', medium: 'cpc' };
    case 'msclkid':
      return { source: 'bing', medium: 'cpc' };
    case 'ttclid':
      return { source: 'tiktok', medium: 'cpc' };
    default:
      return { source: null, medium: null };
  }
}

export function toResolvedAttribution(row: {
  traffic_source?: string | null;
  traffic_medium?: string | null;
  traffic_campaign?: string | null;
  click_id_type?: string | null;
  channel?: string | null;
}): { resolved_source: string; resolved_medium: string; resolved_campaign: string | null } {
  const fromClick = resolveFromClickId(row.click_id_type ?? null);
  const resolved_source =
    normalizeAttributionToken(row.traffic_source) ??
    fromClick.source ??
    normalizeAttributionToken(row.channel) ??
    'unknown';
  const resolved_medium =
    normalizeAttributionToken(row.traffic_medium) ?? fromClick.medium ?? (resolved_source === 'direct' ? 'none' : 'unknown');
  const resolved_campaign = normalizeAttributionToken(row.traffic_campaign);
  return {
    resolved_source: isDirectLikeSource(resolved_source) && fromClick.source ? fromClick.source : resolved_source,
    resolved_medium: resolved_medium === 'unknown' && fromClick.medium ? fromClick.medium : resolved_medium,
    resolved_campaign,
  };
}

export function parseAttribution(
  data: Record<string, unknown>,
  pageUrl: string | null,
  referrer: string | null,
): AttributionData {
  const fromPayload = {
    source: normalizeAttributionToken(data.traffic_source ?? data.utm_source ?? data.source),
    medium: normalizeAttributionToken(data.traffic_medium ?? data.utm_medium ?? data.medium),
    campaign: normalizeAttributionToken(data.traffic_campaign ?? data.utm_campaign ?? data.campaign),
    content: normalizeAttributionToken(data.traffic_content ?? data.utm_content),
    term: normalizeAttributionToken(data.traffic_term ?? data.utm_term),
  };

  let source = fromPayload.source;
  let medium = fromPayload.medium;
  let campaign = fromPayload.campaign;
  let content = fromPayload.content;
  let term = fromPayload.term;
  let click = pickClickId(data);

  if (pageUrl) {
    try {
      const u = new URL(pageUrl);
      source = source ?? normalizeAttributionToken(u.searchParams.get('utm_source'));
      medium = medium ?? normalizeAttributionToken(u.searchParams.get('utm_medium'));
      campaign = campaign ?? normalizeAttributionToken(u.searchParams.get('utm_campaign'));
      content = content ?? normalizeAttributionToken(u.searchParams.get('utm_content'));
      term = term ?? normalizeAttributionToken(u.searchParams.get('utm_term'));
      if (!click.clickId) {
        click = pickClickId({
          gclid: u.searchParams.get('gclid'),
          fbclid: u.searchParams.get('fbclid'),
          ttclid: u.searchParams.get('ttclid'),
          msclkid: u.searchParams.get('msclkid'),
        });
      }
    } catch {
      /* ignore */
    }
  }

  if (!source || !medium) {
    const inferred = inferAttributionFromReferrer(referrer);
    source = source ?? inferred.source;
    medium = medium ?? inferred.medium;
  }

  return {
    source,
    medium,
    campaign,
    content,
    term,
    clickId: click.clickId,
    clickIdType: click.clickIdType,
  };
}
