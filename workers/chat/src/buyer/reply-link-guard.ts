import {getGroqResponse, type GroqMessage} from '../ai-client';
import type {Env} from '../config/bindings';
import type {BuyerChannelId} from './channel-switch';
import {hostAllowedForChannel} from './channel-origins';
import {sanitizeUrlForLog} from './url-log-sanitize';

/** Gdy w turze był search_catalog. */
export const REPLY_LINK_REJECTED_CATALOG_MESSAGE =
  'Nie znajduję takiego produktu w naszej ofercie.';

export const REPLY_LINK_REJECTED_NEUTRAL_MESSAGE =
  'Nie mogę potwierdzić tej informacji w naszych danych.';

/**
 * Gdy w tej turze udany create_cart/update_cart, a guard odrzucił link —
 * neutralna notatka bez URL (nie stub „brak produktu”).
 * Preferuj buildCartContinueReply gdy jest exact continue_url.
 */
export const REPLY_CART_LINK_REJECTED_AFTER_MUTATION_MESSAGE =
  'Koszyk jest zaktualizowany. Nie mogę teraz bezpiecznie podać linku — proszę napisać, jeśli mam go powtórzyć.';

/** Brak mutacji koszyka w turze — zamiast fałszywego CTA z odrzuconego linku. */
export const REPLY_NOT_YET_IN_CART_MESSAGE =
  'Produkt nie został jeszcze dodany do koszyka. Proszę potwierdzić wariant, a dodam go.';

/** Zamknięta lista fraz CTA koszyka/kasy z naszych szablonów (nie regex „sensu”). */
export const CART_CHECKOUT_CTA_PHRASES: readonly string[] = [
  'Zobacz koszyk i przejdź do kasy',
  'Przejdź do koszyka',
  'Link do koszyka',
  'Przejdź do kasy',
  'Zobacz koszyk',
];

export function containsCartCheckoutCtaPhrase(text: string): boolean {
  const t = text.trim();
  if (!t) return false;
  const lower = t.toLowerCase();
  return CART_CHECKOUT_CTA_PHRASES.some((phrase) => lower.includes(phrase.toLowerCase()));
}

/** Tylko po sukcesie create/update w bieżącej turze — nie samo sessionCartId. */
export function applyCartMutationHistoryOverride(
  guarded: string,
  cartMutatedSuccessfullyThisTurn: boolean,
): string {
  if (
    cartMutatedSuccessfullyThisTurn &&
    guarded === REPLY_LINK_REJECTED_CATALOG_MESSAGE
  ) {
    return REPLY_CART_LINK_REJECTED_AFTER_MUTATION_MESSAGE;
  }
  return guarded;
}

/** @deprecated użyj REPLY_LINK_REJECTED_CATALOG_MESSAGE */
export const REPLY_LINK_REJECTED_MESSAGE = REPLY_LINK_REJECTED_CATALOG_MESSAGE;

/** Dowolny cel w nawiasie — w tym placeholdery {{continue_url}}. */
const MARKDOWN_LINK_ANY_DEST_RE = /\[([^\]]*)\]\(([^)]+)\)/gi;
const MARKDOWN_LINK_HTTP_RE = /\[([^\]]*)\]\((https?:\/\/[^)\s]+)\)/gi;
const BARE_URL_RE = /https?:\/\/[^\s)\]>]+/gi;

function normalizeUrlForAllowlist(url: string): string {
  try {
    const u = new URL(url.trim());
    u.hash = '';
    return u.toString().replace(/\/$/, '');
  } catch {
    return url.trim();
  }
}

export function collectAllowedUrls(allowed: Iterable<string>): Set<string> {
  const set = new Set<string>();
  for (const raw of allowed) {
    if (!raw?.trim()) continue;
    set.add(normalizeUrlForAllowlist(raw));
  }
  return set;
}

/** Mapa norm → oryginał (z `#`), by emitować kotwicę mimo strip hash w allowliście. */
export function collectOriginalUrlByNorm(allowed: Iterable<string>): Map<string, string> {
  const map = new Map<string, string>();
  for (const raw of allowed) {
    if (!raw?.trim()) continue;
    const norm = normalizeUrlForAllowlist(raw);
    if (!map.has(norm)) map.set(norm, raw.trim());
  }
  return map;
}

export type SanitizeMarkdownLinksOpts = {
  channelId?: BuyerChannelId;
  /** Preferowany URL z kotwicą przy emitowaniu dozwolonego linku. */
  originalByNorm?: Map<string, string>;
  /**
   * Host z env.SHOP_DOMAIN (np. epir-art-silver-jewellery.myshopify.com).
   * Dozwolony wyłącznie gdy URL jest exact na allowliście (continue_url tej tury).
   */
  shopDomain?: string;
};

/** Normalizuje SHOP_DOMAIN do hostname (bez protokołu / ścieżki). */
export function normalizeShopDomainHost(raw: string | undefined | null): string | null {
  const t = raw?.trim();
  if (!t) return null;
  try {
    if (t.includes('://')) return new URL(t).hostname.toLowerCase();
  } catch {
    return null;
  }
  return t.replace(/\/$/, '').toLowerCase();
}

function isOnExactAllowlist(norm: string, allowedUrls: Set<string>): boolean {
  if (allowedUrls.has(norm)) return true;
  for (const allowed of allowedUrls) {
    if (norm === allowed) return true;
  }
  return false;
}

function isAllowedDest(
  dest: string,
  allowedUrls: Set<string>,
  opts?: SanitizeMarkdownLinksOpts,
): boolean {
  const trimmed = dest.trim();
  if (!trimmed.startsWith('http://') && !trimmed.startsWith('https://')) {
    return false;
  }
  let hostname = '';
  try {
    hostname = new URL(trimmed).hostname.toLowerCase();
  } catch {
    return false;
  }
  const norm = normalizeUrlForAllowlist(trimmed);
  // Exact allowlista najpierw — bez dopasowania prefiksem.
  if (!isOnExactAllowlist(norm, allowedUrls)) return false;

  const channelId = opts?.channelId;
  if (!channelId) return true;
  if (hostAllowedForChannel(hostname, channelId)) return true;
  // Cart MCP continue_url: host SHOP_DOMAIN tylko gdy URL exact z allowlisty tej tury.
  const shopHost = normalizeShopDomainHost(opts?.shopDomain);
  if (shopHost && hostname === shopHost) return true;
  return false;
}

const LOOSE_PLACEHOLDER_RE = /\{\{[^{}]+\}\}/g;

/** Cel linku koszyka/kasy/placeholder — usuń cały markdown link wraz z etykietą. */
export function isCartCheckoutOrPlaceholderDest(dest: string): boolean {
  const d = dest.trim();
  if (!d) return false;
  if (d.includes('{{')) return true;
  const lower = d.toLowerCase();
  if (lower.includes('/cart/') || lower.includes('/cart?')) return true;
  if (lower.includes('checkout')) return true;
  if (d.startsWith('/') && lower.includes('cart')) return true;
  try {
    const u = new URL(d);
    const path = u.pathname.toLowerCase();
    if (path.includes('/cart')) return true;
    if (path.includes('checkout')) return true;
  } catch {
    /* relative or non-URL */
  }
  return false;
}

/** Usuwa luźne {{...}} poza składnią linku Markdown (nie podstawia URL). */
export function stripLoosePlaceholders(text: string): string {
  if (!text.includes('{{')) return text;
  const next = text.replace(LOOSE_PLACEHOLDER_RE, '');
  if (next !== text) {
    console.log(
      JSON.stringify({
        tag: 'buyer.reply_link_stripped',
        reason: 'loose_placeholder',
        destPattern: 'placeholder',
      }),
    );
  }
  return next.replace(/[ \t]{2,}/g, ' ').replace(/ \n/g, '\n').trimEnd();
}

/**
 * Usuwa linki Markdown z celami spoza allowlisty (w tym {{placeholders}}).
 * Host poza kanałem = odrzucony. Kotwica `#` z oryginału allowlisty jest zachowana.
 */
export function sanitizeMarkdownLinks(
  text: string,
  allowedUrls: Set<string>,
  opts?: SanitizeMarkdownLinksOpts,
): string {
  const withoutBadLinks = text.replace(
    MARKDOWN_LINK_ANY_DEST_RE,
    (full, label: string, dest: string) => {
      if (isAllowedDest(dest, allowedUrls, opts)) {
        const norm = normalizeUrlForAllowlist(dest);
        const original = opts?.originalByNorm?.get(norm);
        if (original && original.includes('#') && !String(dest).includes('#')) {
          const lbl = typeof label === 'string' ? label : '';
          return `[${lbl}](${original})`;
        }
        if (original && original.includes('#')) {
          const lbl = typeof label === 'string' ? label : '';
          return `[${lbl}](${original})`;
        }
        return full;
      }
      const trimmedLabel = typeof label === 'string' ? label.trim() : '';
      console.log(
        JSON.stringify({
          tag: 'buyer.reply_link_stripped',
          reason: 'markdown_dest_not_allowed',
          destPattern: dest.includes('{{') ? 'placeholder' : 'non_http_or_foreign',
        }),
      );
      if (isCartCheckoutOrPlaceholderDest(dest)) {
        return '';
      }
      return trimmedLabel || '';
    },
  );
  return stripLoosePlaceholders(withoutBadLinks);
}

export function urlsInReply(text: string): string[] {
  const found = new Set<string>();
  let m: RegExpExecArray | null;
  MARKDOWN_LINK_HTTP_RE.lastIndex = 0;
  while ((m = MARKDOWN_LINK_HTTP_RE.exec(text)) !== null) {
    if (m[2]) found.add(m[2]);
  }
  BARE_URL_RE.lastIndex = 0;
  while ((m = BARE_URL_RE.exec(text)) !== null) {
    found.add(m[0]);
  }
  return [...found];
}

export function foreignHostsInReply(
  reply: string,
  allowedUrls: Set<string>,
): string[] {
  const foreign: string[] = [];
  for (const url of urlsInReply(reply)) {
    if (url.includes('|')) {
      foreign.push('pipe');
      continue;
    }
    const norm = normalizeUrlForAllowlist(url);
    if (allowedUrls.has(norm)) continue;
    let matched = false;
    for (const allowed of allowedUrls) {
      if (norm === allowed) {
        matched = true;
        break;
      }
    }
    if (matched) continue;
    try {
      foreign.push(new URL(url).hostname);
    } catch {
      foreign.push('parse_error');
    }
  }
  return foreign;
}

function rejectionMessage(hadSearchCatalogThisTurn: boolean): string {
  return hadSearchCatalogThisTurn
    ? REPLY_LINK_REJECTED_CATALOG_MESSAGE
    : REPLY_LINK_REJECTED_NEUTRAL_MESSAGE;
}

function logReplyLinkRejected(rawUrlOrHost: string, reason: 'not_in_allowlist' | 'pipe' | 'parse_error'): void {
  const sanitized =
    rawUrlOrHost === 'pipe' || rawUrlOrHost === 'parse_error'
      ? {host: null, pathPattern: null, has_query: false, reason: rawUrlOrHost}
      : sanitizeUrlForLog(
          rawUrlOrHost.includes('://') ? rawUrlOrHost : `https://${rawUrlOrHost}/`,
          reason,
        );
  console.log(
    JSON.stringify({
      tag: 'buyer.reply_link_rejected',
      host: sanitized.host,
      pathPattern: sanitized.pathPattern,
      has_query: sanitized.has_query,
      reason: sanitized.reason,
    }),
  );
}

export async function guardBuyerReplyLinks(
  env: Env,
  reply: string,
  allowedUrls: Set<string>,
  opts: {
    sessionId?: string;
    systemBase: string;
    userText: string;
    hadSearchCatalogThisTurn: boolean;
  },
): Promise<string> {
  const foreign = foreignHostsInReply(reply, allowedUrls);
  if (!foreign.length) return reply;

  const firstForeignUrl = urlsInReply(reply).find((u) => {
    if (u.includes('|')) return true;
    const norm = normalizeUrlForAllowlist(u);
    if (allowedUrls.has(norm)) return false;
    for (const allowed of allowedUrls) {
      if (norm === allowed) return false;
    }
    return true;
  });
  const rejectReason = firstForeignUrl?.includes('|')
    ? 'pipe'
    : firstForeignUrl
      ? 'not_in_allowlist'
      : 'parse_error';

  const allowedList =
    allowedUrls.size > 0
      ? [...allowedUrls]
          .map((u) => {
            try {
              const parsed = new URL(u);
              return `${parsed.origin}${parsed.pathname.replace(/\/cart\/c\/[^/]+/i, '/cart/c/:token').replace(/\/products\/[^/]+/i, '/products/:handle')}`;
            } catch {
              return '(url)';
            }
          })
          .join('\n')
      : '(brak dozwolonych linków w tej turze)';

  // Retry: odrzucona treść jako notatka systemowa + user (nie assistant).
  // @see https://console.groq.com/docs/tool-use
  const retryMessages: GroqMessage[] = [
    {
      role: 'system',
      content: `${opts.systemBase}\n\n[Dozwolone URL tej tury — wzorce]\n${allowedList}\n\n[NOTATKA SYSTEMOWA] Poprzednia odpowiedź zawierała linki spoza wyników narzędzi i faktów i została odrzucona. Nie powtarzaj jej. Podawaj wyłącznie dozwolone adresy.`,
    },
    {
      role: 'user',
      content: `${opts.userText}\n\nPopraw odpowiedź bez niedozwolonych linków.`,
    },
  ];
  const rejected = rejectionMessage(opts.hadSearchCatalogThisTurn);
  try {
    const retried = await getGroqResponse(retryMessages, env, {
      timingLabel: 'buyer_reply_link_guard_retry',
      sessionId: opts.sessionId,
    });
    const trimmed = typeof retried === 'string' ? retried.trim() : '';
    if (!trimmed) {
      logReplyLinkRejected(firstForeignUrl ?? foreign[0] ?? '', rejectReason);
      return rejected;
    }
    const foreignAfter = foreignHostsInReply(trimmed, allowedUrls);
    if (!foreignAfter.length) return trimmed;
    logReplyLinkRejected(firstForeignUrl ?? foreignAfter[0] ?? '', rejectReason);
    return rejected;
  } catch (e) {
    console.warn('[buyer.reply_link_guard] retry failed', e);
    logReplyLinkRejected(firstForeignUrl ?? foreign[0] ?? '', rejectReason);
    return rejected;
  }
}
