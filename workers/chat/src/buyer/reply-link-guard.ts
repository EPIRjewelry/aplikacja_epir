import {getGroqResponse, type GroqMessage} from '../ai-client';
import type {Env} from '../config/bindings';

/** Gdy w turze był search_catalog. */
export const REPLY_LINK_REJECTED_CATALOG_MESSAGE =
  'Nie znajduję takiego produktu w naszej ofercie.';

export const REPLY_LINK_REJECTED_NEUTRAL_MESSAGE =
  'Nie mogę potwierdzić tej informacji w naszych danych.';

/** @deprecated użyj REPLY_LINK_REJECTED_CATALOG_MESSAGE */
export const REPLY_LINK_REJECTED_MESSAGE = REPLY_LINK_REJECTED_CATALOG_MESSAGE;

const MARKDOWN_LINK_RE = /\[([^\]]*)\]\((https?:\/\/[^)\s]+)\)/gi;
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

export function urlsInReply(text: string): string[] {
  const found = new Set<string>();
  let m: RegExpExecArray | null;
  MARKDOWN_LINK_RE.lastIndex = 0;
  while ((m = MARKDOWN_LINK_RE.exec(text)) !== null) {
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
    const norm = normalizeUrlForAllowlist(url);
    if (allowedUrls.has(norm)) continue;
    let matched = false;
    for (const allowed of allowedUrls) {
      if (norm === allowed || norm.startsWith(`${allowed}/`)) {
        matched = true;
        break;
      }
    }
    if (matched) continue;
    try {
      foreign.push(new URL(url).hostname);
    } catch {
      foreign.push(url);
    }
  }
  return foreign;
}

function rejectionMessage(hadSearchCatalogThisTurn: boolean): string {
  return hadSearchCatalogThisTurn
    ? REPLY_LINK_REJECTED_CATALOG_MESSAGE
    : REPLY_LINK_REJECTED_NEUTRAL_MESSAGE;
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

  const allowedList =
    allowedUrls.size > 0 ? [...allowedUrls].join('\n') : '(brak dozwolonych linków w tej turze)';

  const retryMessages: GroqMessage[] = [
    {
      role: 'system',
      content: `${opts.systemBase}\n\n[Dozwolone URL tej tury]\n${allowedList}\n\n[NOTATKA SYSTEMOWA] Poprzednia odpowiedź zawierała linki spoza wyników narzędzi i faktów. Usuń je. Podawaj wyłącznie dozwolone adresy.`,
    },
    {role: 'user', content: opts.userText},
    {role: 'assistant', content: reply},
  ];
  const rejected = rejectionMessage(opts.hadSearchCatalogThisTurn);
  try {
    const retried = await getGroqResponse(retryMessages, env, {
      timingLabel: 'buyer_reply_link_guard_retry',
      sessionId: opts.sessionId,
    });
    const foreignAfter = foreignHostsInReply(retried, allowedUrls);
    if (!foreignAfter.length) return retried.trim();
    console.log(
      JSON.stringify({
        tag: 'buyer.reply_link_rejected',
        host: foreignAfter[0],
      }),
    );
    return rejected;
  } catch (e) {
    console.warn('[buyer.reply_link_guard] retry failed', e);
    console.log(
      JSON.stringify({
        tag: 'buyer.reply_link_rejected',
        host: foreign[0],
      }),
    );
    return rejected;
  }
}
