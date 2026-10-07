/**
 * EPIR (epirbizuteria.pl) i Kazka (kazka.epirbizuteria.pl) nie dzielą głosu ani katalogu.
 * Host strony, na którą patrzy klient, wygrywa z brandem z body.
 * App Proxy sklepu Liquid jest zawsze EPIR — podrobiony page_host nie przełącza go na Kazkę.
 * Brak sygnału marki = EPIR, nigdy Kazka.
 *
 * `brandKey` opisuje tylko głos i filtr historii w pamięci procesu.
 * Nie jest prefiksem SessionDO i nie zmienia `session_id` piksela.
 */

import {isOperatorChannel} from './operator/operator-channel';

export type BuyerBrandSide = 'epir' | 'kazka' | 'zareczyny';

export type ChatBrandLock = {
  side: BuyerBrandSide | 'operator';
  brand: string;
  storefrontId: string;
  channel: string;
  /** Głos i filtr historii. Nie jest nazwą ani prefiksem SessionDO. */
  brandKey: string;
  source: 'app-proxy' | 'host' | 'ingress' | 'body' | 'default' | 'operator';
};

export type BrandLockInput = {
  appProxyVerified?: boolean;
  contextOverride?: {storefrontId?: string; channel?: string; brand?: string};
  bodyBrand?: string;
  bodyStorefrontId?: string;
  bodyChannel?: string;
  pageHost?: string | null;
  origin?: string | null;
  referer?: string | null;
};

const EPIR_GREETING =
  'Witaj! Jestem Gemma, doradca z pracowni EPIR Art Jewellery. Jak mogę Ci dzisiaj pomóc? 🌟';
const KAZKA_GREETING =
  'Witaj! Jestem Gemma, doradca marki Kazka Jewelry. Jak mogę Ci dzisiaj pomóc? ✨';
const ZARECZYNY_GREETING =
  'Witaj! Jestem Gemma, doradca pierścionków zaręczynowych EPIR. Jak mogę Ci dzisiaj pomóc? 💍';
const OPERATOR_GREETING =
  'Witaj! Jestem wewnętrznym agentem analityczno-doradczym EPIR (dane sklepu, pixel, kampanie). W czym pomóc?';
const EPIR_FOREIGN_PRODUCT_FALLBACK =
  'W ofercie EPIR Art Jewellery dobiorę inny model. Napisz, czy szukasz złota, srebra albo konkretnego kamienia.';

const KAZKA_ADVISOR = /kazka jewelry/i;
const EPIR_SELF_ID =
  /doradca z pracowni EPIR Art Jewellery|doradca pierścionków zaręczynowych EPIR|doradczyni[ąa] EPIR Art Jewellery/i;

const HOST_SIDE: Array<{side: BuyerBrandSide; hosts: string[]}> = [
  {side: 'kazka', hosts: ['kazka.epirbizuteria.pl']},
  {side: 'zareczyny', hosts: ['zareczyny.epirbizuteria.pl']},
  {side: 'epir', hosts: ['epirbizuteria.pl', 'www.epirbizuteria.pl', 'l.epirbizuteria.pl']},
];

function normalizeToken(value: unknown): string {
  return typeof value === 'string' ? value.trim().toLowerCase() : '';
}

export function hostFromUrl(raw: string | null | undefined): string | null {
  if (!raw?.trim()) return null;
  const trimmed = raw.trim();
  try {
    const withScheme = /^https?:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`;
    return new URL(withScheme).hostname.toLowerCase().replace(/\.$/, '');
  } catch {
    return null;
  }
}

export function buyerSideFromHost(host: string | null | undefined): BuyerBrandSide | null {
  const normalized = host?.trim().toLowerCase().replace(/\.$/, '');
  if (!normalized) return null;
  for (const entry of HOST_SIDE) {
    if (entry.hosts.includes(normalized)) return entry.side;
  }
  return null;
}

function sideFromStorefront(storefrontId?: string): BuyerBrandSide | null {
  const id = normalizeToken(storefrontId);
  if (!id) return null;
  if (id === 'kazka') return 'kazka';
  if (id === 'zareczyny') return 'zareczyny';
  if (id === 'online-store' || id === 'epir' || id === 'epir-liquid' || id === 'epirbizuteria.pl') {
    return 'epir';
  }
  return null;
}

function sideFromChannel(channel?: string): BuyerBrandSide | null {
  const id = normalizeToken(channel);
  if (!id) return null;
  if (id === 'hydrogen-kazka' || id === 'kazka_headless') return 'kazka';
  if (id === 'hydrogen-zareczyny') return 'zareczyny';
  if (id === 'online-store') return 'epir';
  return null;
}

function sideFromBrand(brand?: string): BuyerBrandSide | null {
  const id = normalizeToken(brand);
  if (!id) return null;
  if (id === 'kazka') return 'kazka';
  if (id === 'zareczyny') return 'zareczyny';
  if (id === 'epir' || id === 'online-store' || id === 'epir-liquid' || id === 'epirbizuteria.pl') {
    return 'epir';
  }
  return null;
}

/**
 * storefront i channel są wiążące. Sam brand z body nie przebija storefrontu EPIR.
 */
export function sideFromRouting(
  storefrontId?: string,
  channel?: string,
  brand?: string,
): BuyerBrandSide | null {
  return sideFromStorefront(storefrontId) ?? sideFromChannel(channel) ?? sideFromBrand(brand);
}

function lockForSide(side: BuyerBrandSide, source: ChatBrandLock['source']): ChatBrandLock {
  if (side === 'kazka') {
    return {
      side,
      brand: 'kazka',
      storefrontId: 'kazka',
      channel: 'hydrogen-kazka',
      brandKey: 'kazka',
      source,
    };
  }
  if (side === 'zareczyny') {
    return {
      side,
      brand: 'zareczyny',
      storefrontId: 'zareczyny',
      channel: 'hydrogen-zareczyny',
      brandKey: 'zareczyny',
      source,
    };
  }
  return {
    side: 'epir',
    brand: 'epir',
    storefrontId: 'online-store',
    channel: 'online-store',
    brandKey: 'epir',
    source,
  };
}

function firstHostSide(input: BrandLockInput): BuyerBrandSide | null {
  const candidates = [input.pageHost, hostFromUrl(input.referer), hostFromUrl(input.origin)];
  for (const candidate of candidates) {
    const host = candidate?.includes('://') || candidate?.includes('/') ? hostFromUrl(candidate) : candidate;
    const side = buyerSideFromHost(host);
    if (side) return side;
  }
  return null;
}

export function resolveChatBrandLock(input: BrandLockInput): ChatBrandLock {
  const overrideChannel = input.contextOverride?.channel;
  const overrideStorefront = input.contextOverride?.storefrontId;
  if (isOperatorChannel(overrideChannel) || normalizeToken(overrideStorefront) === 'operator') {
    return {
      side: 'operator',
      brand: 'epir',
      storefrontId: 'operator',
      channel: 'operator',
      brandKey: 'operator',
      source: 'operator',
    };
  }

  if (input.appProxyVerified) {
    return lockForSide('epir', 'app-proxy');
  }

  const hostSide = firstHostSide(input);
  if (hostSide) return lockForSide(hostSide, 'host');

  const ingressSide = sideFromRouting(
    input.contextOverride?.storefrontId,
    input.contextOverride?.channel,
    input.contextOverride?.brand,
  );
  if (ingressSide) return lockForSide(ingressSide, 'ingress');

  const bodySide = sideFromRouting(input.bodyStorefrontId, input.bodyChannel, input.bodyBrand);
  if (bodySide) return lockForSide(bodySide, 'body');

  return lockForSide('epir', 'default');
}

export function greetingForBrandLock(lock: ChatBrandLock): string {
  if (lock.side === 'operator') return OPERATOR_GREETING;
  if (lock.side === 'kazka') return KAZKA_GREETING;
  if (lock.side === 'zareczyny') return ZARECZYNY_GREETING;
  return EPIR_GREETING;
}

function splitSentences(text: string): string[] {
  return text
    .split(/(?<=[.!?])\s+/)
    .map((part) => part.trim())
    .filter((part) => part.length > 0);
}

function dropSentences(text: string, pattern: RegExp): string {
  const kept = splitSentences(text).filter((sentence) => !pattern.test(sentence));
  return kept.join(' ').trim();
}

/** Zostaje sama formułka powitania, już bez nazwy drugiej marki. */
function isGreetingShell(text: string): boolean {
  const sentences = splitSentences(text);
  if (sentences.length === 0) return true;
  return sentences.every((sentence) => {
    const normalized = sentence
      .replace(/[✨🌟💍!?.,…]/g, '')
      .replace(/\s+/g, ' ')
      .trim()
      .toLowerCase();
    if (!normalized) return true;
    return /^(witaj|cześć|czesc|hej|jak mogę ci dzisiaj pomóc|jak moge ci dzisiaj pomoc)$/.test(normalized);
  });
}

/**
 * Ostatnia siatka na odpowiedzi modelu: EPIR nie mówi głosem Kazki.
 * Kazka nie wita się formułką pracowni EPIR.
 */
export function guardBuyerReply(
  text: string,
  lock: Pick<ChatBrandLock, 'side'>,
): {text: string; rewritten: boolean} {
  if (!text?.trim() || lock.side === 'operator') return {text, rewritten: false};

  if (lock.side === 'kazka') {
    if (!EPIR_SELF_ID.test(text)) return {text, rewritten: false};
    const kept = dropSentences(text, EPIR_SELF_ID);
    if (kept) return {text: kept, rewritten: true};
    return {text: KAZKA_GREETING, rewritten: true};
  }

  if (!KAZKA_ADVISOR.test(text)) return {text, rewritten: false};

  let kept = dropSentences(text, KAZKA_ADVISOR);
  if (!kept || isGreetingShell(kept)) {
    return {
      text: lock.side === 'zareczyny' ? ZARECZYNY_GREETING : EPIR_GREETING,
      rewritten: true,
    };
  }
  if (kept) return {text: kept, rewritten: kept !== text};
  if (lock.side === 'zareczyny') return {text: ZARECZYNY_GREETING, rewritten: true};
  return {text: EPIR_FOREIGN_PRODUCT_FALLBACK, rewritten: true};
}

export function scrubKazkaAdvisorCopy(text: string): string {
  if (!text) return '';
  return KAZKA_ADVISOR.test(text) ? '' : text;
}

/**
 * Rzutowanie historii na markę bieżącego żądania. Nie zapisuje nic do SessionDO:
 * ta sama sesja zostaje w storage, a do UI i modelu idzie kopia bez głosu drugiej marki.
 */
export function projectHistoryForBrand<T extends {role?: string; content?: unknown}>(
  entries: readonly T[],
  side: ChatBrandLock['side'],
): T[] {
  if (side === 'operator') return entries.slice();
  return entries.map((entry) => {
    if (entry.role !== 'assistant' || typeof entry.content !== 'string' || !entry.content.trim()) {
      return entry;
    }
    const guarded = guardBuyerReply(entry.content, {side});
    if (!guarded.rewritten) return entry;
    return {...entry, content: guarded.text};
  });
}
