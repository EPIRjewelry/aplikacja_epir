/**
 * Minimalizacja danych w logach Workers (RODO art. 5 ust. 1 lit. c / art. 32).
 * @see https://eur-lex.europa.eu/eli/reg/2016/679/oj
 * @see https://developers.cloudflare.com/workers/observability/logs/workers-logs/
 */

export type UrlLogReason =
  | 'not_in_allowlist'
  | 'trailing_punct'
  | 'pipe'
  | 'parse_error';

export type SanitizedUrlLog = {
  host: string | null;
  pathPattern: string | null;
  has_query: boolean;
  reason: UrlLogReason;
};

function pathPatternOf(pathname: string): string {
  if (/^\/cart\/c\//i.test(pathname)) return '/cart/c/:token';
  if (/^\/products\//i.test(pathname)) return '/products/:handle';
  if (/^\/checkouts\/cn\//i.test(pathname)) return '/checkouts/cn/:token';
  if (/^\/cart/i.test(pathname)) return '/cart';
  const segs = pathname.split('/').filter(Boolean);
  if (segs.length === 0) return '/';
  return `/${segs[0]}/:rest`;
}

/** Sanityzuje URL do logu — nigdy tokenów, key, pełnej ścieżki z secret. */
export function sanitizeUrlForLog(
  raw: string,
  reason: UrlLogReason = 'not_in_allowlist',
): SanitizedUrlLog {
  const trimmed = raw.trim();
  if (trimmed.includes('|')) {
    const first = trimmed.split('|')[0] ?? trimmed;
    const base = sanitizeUrlForLog(first, 'pipe');
    return {...base, reason: 'pipe'};
  }
  try {
    const u = new URL(trimmed);
    return {
      host: u.hostname || null,
      pathPattern: pathPatternOf(u.pathname),
      has_query: Boolean(u.search && u.search.length > 1),
      reason,
    };
  } catch {
    return {
      host: null,
      pathPattern: null,
      has_query: trimmed.includes('?'),
      reason: 'parse_error',
    };
  }
}
