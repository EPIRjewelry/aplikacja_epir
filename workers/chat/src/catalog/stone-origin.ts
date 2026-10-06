/**
 * Pochodzenie kamienia wyłącznie z karty: naturalny vs laboratoryjny / syntetyczny.
 * Pytanie ogólne nie generalizuje asortymentu. Karta bez sygnału: pracownia.
 */

import {isKazkaCatalogBrand} from './kazka-assortment';
import {detectNamedBrowseQuery, detectStoneIntent, shopifyStoneQuery, type StoneIntent} from './stone-intent';

export type StoneOriginAsk = 'natural' | 'lab';

export type CardStoneOrigin = 'natural' | 'lab' | 'mixed' | 'unknown';

export type QualityPriceGroup = {
  kind: 'natural' | 'lab';
  qualities: string[];
  price_min_display_pl?: string;
  price_max_display_pl?: string;
};

const NATURAL_RE =
  /naturaln|nateraln|prawdziw|z\s+kopaln|wydobyw|earth[-\s]?mined|mined\s+(?:diamond|sapphire|stone)|z\s+zloz|z\s+złoż/iu;
const LAB_RE =
  /syntet|syntetczn|laboratoryj|lab(?:oratory)?[-\s]?grown|\blab\b|hodowan|sztuczn|moissanit/iu;
const LAB_ORIGIN_ASK_RE =
  /syntet|syntetczn|laboratoryj|lab(?:oratory)?[-\s]?grown|\blab\b|hodowan|sztuczn|lab\s*grown/iu;

const GENERAL_ORIGIN_ASK =
  /u[zż]ywacie\s+naturaln|czy\s+(?:u[zż]ywacie|są|sa|macie|mamy)\s+(?:kamie\w*\s+)?(?:naturaln|syntet|laboratoryj)|tylko\s+(?:z\s+)?naturaln|tylko\s+syntet|kamienie\s+(?:naturaln|syntet)|pochodzeni[ea]\s+kamien|czy\s+kamie\w*\s+(?:są|sa)\s+naturaln/iu;

const CERTIFICATE_ASK =
  /certyfik|certificate|hallmark|atest(?:\s+kamien)?/iu;

const ABSOLUTE_NATURAL =
  /wyłącznie\s+(?:z\s+)?naturaln|tylko\s+(?:z\s+)?naturaln(?:ych)?\s+z[lł][oó]ż|tylko\s+kamienie\s+naturaln|nie\s+u[zż]ywamy\s+syntet|nie\s+ma(?:my)?\s+syntet|wszystk\w+\s+(?:kamie\w*\s+)?(?:są|sa)\s+naturaln/iu;
const ABSOLUTE_LAB =
  /tylko\s+syntet|wyłącznie\s+syntet|wyłącznie\s+laboratoryj|nie\s+u[zż]ywamy\s+naturaln|nie\s+ma(?:my)?\s+kamieni?\s+naturaln/iu;
const ABSOLUTE_NO_DIAMOND =
  /nie\s+ma(?:my)?\s+(?:w\s+ofercie\s+)?(?:diament|brylant)|nie\s+u[zż]ywamy\s+(?:diament|brylant)/iu;
const ABSOLUTE_CERT =
  /każdy\s+kamie[nń].{0,24}certyfik|wszystk\w+\s+kamie\w*.{0,24}certyfik|kamie\w*\s+są\s+certyfik/iu;

const PRICE_HIGHER = /droższ|drozsz|bardziej\s+drogi|wyższ[aą]\s+cen/iu;
const PRICE_LOWER = /ta[nń]sz|tansz|taniej|niższ[aą]\s+cen/iu;

export const EPIR_ORIGIN_SAFE_LEAD =
  'W katalogu EPIR są kamienie naturalne i syntetyczne, zależnie od modelu.';

export const KAZKA_ORIGIN_SAFE_LEAD =
  'W Kazka diament (brylant) bywa naturalny albo laboratoryjny — wybór w opcji Jakość. Linia Big Lab to tylko kamień laboratoryjny.';

export const ORIGIN_UNKNOWN_ON_CARD =
  'Karta tego nie podaje, potwierdzi pracownia.';

export const CERTIFICATE_UNKNOWN =
  'Karta tego nie podaje, proszę o kontakt z pracownią.';

export function foldStoneText(value: string): string {
  return value
    .normalize('NFD')
    .replace(/\p{M}/gu, '')
    .toLocaleLowerCase('pl-PL');
}

export function detectStoneOriginAsk(text: string): StoneOriginAsk | null {
  const folded = foldStoneText(text);
  const natural = NATURAL_RE.test(text) || NATURAL_RE.test(folded);
  const lab = LAB_ORIGIN_ASK_RE.test(text) || LAB_ORIGIN_ASK_RE.test(folded);
  if (natural && !lab) return 'natural';
  if (lab && !natural) return 'lab';
  return null;
}

const CONTINUATION_TURN =
  /^(a\s+)?(poszukaj|szukaj|poka[zż]\s+wi[eę]cej|inny\s+wariant|co\s+jeszcze|jeszcze\s+raz)/iu;
const WROTE_NATURAL = /naturaln\w*\s+pisałem|pisałem\s+.*naturaln/iu;

/** Dziedziczenie pochodzenia tylko z doprecyzowania bez nowego kamienia / typu produktu. */
export function isConversationContinuationTurn(latest: string, priorTurns: readonly string[]): boolean {
  if (!latest.trim() || !priorTurns.length) return false;
  if (detectStoneIntent(latest)) return false;
  if (detectNamedBrowseQuery(latest)) return false;
  const hints = latestTurnSearchHints(latest);
  if (hints.price || hints.priceCapPln != null || hints.tokens.length) return true;
  if (CONTINUATION_TURN.test(latest) || WROTE_NATURAL.test(latest)) return true;
  return false;
}

export function originAskForTurn(buyerTurns: readonly string[]): StoneOriginAsk | null {
  const lines = buyerTurns.map((turn) => turn.trim()).filter(Boolean);
  if (!lines.length) return null;
  const latest = lines[lines.length - 1] ?? '';
  const askLatest = detectStoneOriginAsk(latest);
  if (detectStoneIntent(latest) && askLatest === null) return null;
  if (askLatest) return askLatest;
  if (!isConversationContinuationTurn(latest, lines.slice(0, -1))) return null;
  for (let index = lines.length - 2; index >= 0; index -= 1) {
    const line = lines[index] ?? '';
    const ask = detectStoneOriginAsk(line);
    if (ask) return ask;
    if (detectStoneIntent(line)) return null;
  }
  return null;
}

export type OriginFilterResult = {
  products: Record<string, unknown>[];
  originFallback: boolean;
  stoneCardsUnfiltered: number;
};

export function originOnCardLabel(product: Record<string, unknown>): string {
  const origin = cardStoneOrigin(product);
  if (origin === 'natural') return 'naturalny';
  if (origin === 'lab') return 'syntetyczny / laboratoryjny';
  if (origin === 'mixed') return 'mieszane (naturalny i laboratoryjny)';
  return 'brak informacji';
}

export function applyOriginFilterWithFallback(
  stoneCards: readonly Record<string, unknown>[],
  ask: StoneOriginAsk | null,
  opts?: {allowFallback?: boolean},
): OriginFilterResult {
  const unfiltered = stoneCards.length;
  if (!ask) return {products: [...stoneCards], originFallback: false, stoneCardsUnfiltered: unfiltered};
  const originHits = filterProductsByOriginAsk(stoneCards, ask);
  if (originHits.length) {
    return {products: originHits, originFallback: false, stoneCardsUnfiltered: unfiltered};
  }
  if (stoneCards.length && opts?.allowFallback !== false) {
    const stamped = stoneCards.map((product) => ({
      ...product,
      origin_on_card: originOnCardLabel(product),
      origin_fallback: true,
    }));
    return {products: stamped, originFallback: true, stoneCardsUnfiltered: unfiltered};
  }
  return {products: [], originFallback: false, stoneCardsUnfiltered: unfiltered};
}

/** Ogólne „używacie naturalnych?” — nie jest pytaniem o jeden SKU. */
export function isStoneOriginAssortmentQuestion(text: string): boolean {
  if (!text.trim()) return false;
  if (CERTIFICATE_ASK.test(text) && !GENERAL_ORIGIN_ASK.test(text)) return false;
  return GENERAL_ORIGIN_ASK.test(text) || GENERAL_ORIGIN_ASK.test(foldStoneText(text));
}

export function isCertificateQuestion(text: string): boolean {
  return CERTIFICATE_ASK.test(text) || CERTIFICATE_ASK.test(foldStoneText(text));
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function collectStrings(value: unknown, depth: number, into: string[]): void {
  if (depth < 0 || value == null) return;
  if (typeof value === 'string') {
    into.push(value);
    return;
  }
  if (Array.isArray(value)) {
    for (const item of value) collectStrings(item, depth - 1, into);
    return;
  }
  if (!isRecord(value)) return;
  for (const [key, child] of Object.entries(value)) {
    if (key === 'media' || key === 'id' || key === 'sku') continue;
    collectStrings(child, depth - 1, into);
  }
}

function productHaystack(product: Record<string, unknown>): string {
  const parts: string[] = [];
  collectStrings(product, 6, parts);
  return parts.join('\n');
}

function lineForProduct(product: Record<string, unknown>): string {
  const title = typeof product.title === 'string' && product.title.trim() ? product.title.trim() : 'Pozycja z katalogu';
  const url = typeof product.url === 'string' ? product.url.trim() : '';
  const name = url ? `[${title}](${url})` : title;
  const price =
    typeof product.price_display_pl === 'string'
      ? product.price_display_pl
      : typeof product.price_min_display_pl === 'string' && typeof product.price_max_display_pl === 'string'
        ? `${product.price_min_display_pl}–${product.price_max_display_pl}`
        : '';
  return price ? `- ${name} — ${price}.` : `- ${name}.`;
}

function formatOriginCardList(products: readonly Record<string, unknown>[]): string {
  const shown = products.slice(0, 4);
  const ask = shown.some((product) => product.price_is_flat === false) ? '\nKtóry wariant Cię interesuje?' : '';
  return `Te pozycje są w katalogu:\n${shown.map(lineForProduct).join('\n')}${ask}`;
}

export function kazkaQualityKind(value: string): 'natural' | 'lab' | null {
  const raw = value.trim();
  if (!raw) return null;
  const folded = foldStoneText(raw).replace(/\s+/g, '');
  if (/\blab\b/i.test(raw) || /labgrown|laboratoryj|syntet/.test(folded)) return 'lab';
  if (/\b(?:black|d\/vvs2|f\/vs2|g\/si|g\/vs2)\b/i.test(raw)) return 'natural';
  if (/\b[defg]\s*\/\s*(vvs|vs|si)\d?\b/i.test(raw)) return 'natural';
  if (/[defg]\/?(vvs|vs|si)\d?/.test(folded)) return 'natural';
  if (/black/.test(folded)) return 'natural';
  if (/naturaln/.test(folded)) return 'natural';
  return null;
}

function optionValuesFromProduct(product: Record<string, unknown>): string[] {
  const out: string[] = [];
  if (Array.isArray(product.options)) {
    for (const option of product.options) {
      if (!isRecord(option)) continue;
      const name = typeof option.name === 'string' ? option.name : '';
      const values = option.values;
      if (Array.isArray(values)) {
        for (const value of values) {
          if (typeof value === 'string') out.push(`${name} ${value}`);
          else if (isRecord(value) && typeof value.label === 'string') out.push(`${name} ${value.label}`);
          else if (isRecord(value) && typeof value.value === 'string') out.push(`${name} ${value.value}`);
          else if (isRecord(value) && typeof value.name === 'string') out.push(`${name} ${value.name}`);
        }
      }
    }
  }
  const variants = Array.isArray(product.variants)
    ? product.variants
    : isRecord(product.variants) && Array.isArray(product.variants.nodes)
      ? product.variants.nodes
      : [];
  for (const variant of variants) {
    if (!isRecord(variant)) continue;
    const selected = variant.selectedOptions ?? variant.options;
    if (!Array.isArray(selected)) continue;
    for (const option of selected) {
      if (!isRecord(option)) continue;
      const name = typeof option.name === 'string' ? option.name : '';
      const value = typeof option.value === 'string' ? option.value : typeof option.label === 'string' ? option.label : '';
      if (value) out.push(`${name} ${value}`);
    }
  }
  return out;
}

function isBigLabProduct(product: Record<string, unknown>): boolean {
  const handle = typeof product.handle === 'string' ? product.handle : '';
  const title = typeof product.title === 'string' ? product.title : '';
  const tags = Array.isArray(product.tags) ? product.tags.join(' ') : '';
  return /big[-\s]?lab/iu.test(`${handle} ${title} ${tags}`);
}

const KNOWN_NATURAL_HANDLES = new Set([
  'zloty-pierscionek-z-naturalnym-szafirem',
  'pierscionek-srebrny-fale-wody-z-szafirem',
]);

const KNOWN_LAB_HANDLES = new Set(['obraczka-z-szafirem-epir-jewellery']);

export function cardStoneOrigin(product: Record<string, unknown>): CardStoneOrigin {
  const handle = typeof product.handle === 'string' ? product.handle.trim().toLocaleLowerCase('en-US') : '';
  if (handle && KNOWN_LAB_HANDLES.has(handle)) return 'lab';
  if (handle && KNOWN_NATURAL_HANDLES.has(handle)) return 'natural';
  if (isBigLabProduct(product)) return 'lab';
  const optionValues = optionValuesFromProduct(product);
  const haystack = `${productHaystack(product)}\n${optionValues.join('\n')}`;
  const natural = NATURAL_RE.test(haystack);
  let lab = LAB_RE.test(haystack);
  let sawNaturalQuality = false;
  let sawLabQuality = false;
  for (const value of [...optionValues, ...haystack.split('\n')]) {
    const kind = kazkaQualityKind(value);
    if (kind === 'natural') sawNaturalQuality = true;
    if (kind === 'lab') sawLabQuality = true;
  }
  const groups = product.quality_price_groups;
  if (Array.isArray(groups)) {
    for (const group of groups) {
      if (!isRecord(group) || group.kind !== 'natural' && group.kind !== 'lab') continue;
      if (group.kind === 'natural') sawNaturalQuality = true;
      if (group.kind === 'lab') sawLabQuality = true;
    }
  }
  if (sawLabQuality) lab = true;
  if (sawNaturalQuality && sawLabQuality) return 'mixed';
  if (sawNaturalQuality && !lab) return 'natural';
  if (sawLabQuality && !natural) return 'lab';
  if (natural && lab) return 'mixed';
  if (natural) return 'natural';
  if (lab) return 'lab';
  return 'unknown';
}

export function productMatchesOriginAsk(product: Record<string, unknown>, ask: StoneOriginAsk): boolean {
  const origin = cardStoneOrigin(product);
  if (ask === 'natural') {
    if (origin === 'lab') return false;
    if (origin === 'natural' || origin === 'mixed') return true;
    const hay = productHaystack(product);
    if (/syntet|laboratoryj|\blab\b|sztuczn/iu.test(hay) && !/naturaln/iu.test(hay)) return false;
    return false;
  }
  if (origin === 'unknown') return false;
  if (origin === 'mixed') return true;
  return origin === ask;
}

export function filterProductsByOriginAsk(
  products: readonly Record<string, unknown>[],
  ask: StoneOriginAsk | null,
): Record<string, unknown>[] {
  if (!ask) return [...products];
  return products.filter((product) => productMatchesOriginAsk(product, ask));
}

export function pickMixedOriginCards(
  products: readonly Record<string, unknown>[],
  limit = 3,
): Record<string, unknown>[] {
  const natural: Record<string, unknown>[] = [];
  const lab: Record<string, unknown>[] = [];
  const rest: Record<string, unknown>[] = [];
  for (const product of products) {
    const origin = cardStoneOrigin(product);
    if (origin === 'natural' || origin === 'mixed') natural.push(product);
    else if (origin === 'lab') lab.push(product);
    else rest.push(product);
  }
  const out: Record<string, unknown>[] = [];
  const seen = new Set<Record<string, unknown>>();
  const take = (list: Record<string, unknown>[]) => {
    for (const product of list) {
      if (out.length >= limit) return;
      if (seen.has(product)) continue;
      seen.add(product);
      out.push(product);
    }
  };
  take(natural.slice(0, 2));
  take(lab.slice(0, 2));
  take(rest);
  return out.slice(0, limit);
}

export type TurnSearchHints = {
  price: 'higher' | 'lower' | null;
  /** Górny limit budżetu w PLN (np. „do 6000 zł”). */
  priceCapPln: number | null;
  tokens: string[];
};

function parsePlnMajor(value: unknown): number | null {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (typeof value !== 'string') return null;
  const parsed = Number(value.replace(/[^\d.,]/g, '').replace(/\s/g, '').replace(',', '.'));
  return Number.isFinite(parsed) ? parsed : null;
}

export function detectPriceCapPln(text: string): number | null {
  const match = text.match(/\bdo\s+(\d{1,3}(?:[\s\u00a0]?\d{3})*|\d+)\s*(?:zł|zl|pln)?\b/iu);
  if (!match?.[1]) return null;
  const amount = Number(match[1].replace(/[\s\u00a0]/g, ''));
  return Number.isFinite(amount) && amount > 0 ? amount : null;
}

/** Najniższa cena karty (min wariantów albo flat). */
export function productMinPricePln(product: Record<string, unknown>): number | null {
  const fromDisplay =
    parsePlnMajor(product.price_min_display_pl) ??
    parsePlnMajor(product.price_display_pl) ??
    parsePlnMajor(product.page_price_display_pl);
  if (fromDisplay != null) return fromDisplay;
  if (!Array.isArray(product.variants)) return null;
  let min: number | null = null;
  for (const variant of product.variants) {
    if (!variant || typeof variant !== 'object') continue;
    const amount =
      parsePlnMajor((variant as {price_display_pl?: unknown}).price_display_pl) ??
      parsePlnMajor(
        typeof (variant as {price?: unknown}).price === 'object' && (variant as {price?: {amount?: unknown}}).price
          ? (variant as {price: {amount?: unknown}}).price.amount
          : (variant as {price?: unknown}).price,
      );
    if (amount == null) continue;
    min = min == null ? amount : Math.min(min, amount);
  }
  return min;
}

export function latestTurnSearchHints(text: string): TurnSearchHints {
  const price = PRICE_HIGHER.test(text) ? 'higher' : PRICE_LOWER.test(text) ? 'lower' : null;
  const tokens: string[] = [];
  if (/fale\s+wody/iu.test(text)) tokens.push('fale wody');
  return {price, priceCapPln: detectPriceCapPln(text), tokens};
}

export function productMinPricePlnForOrigin(
  product: Record<string, unknown>,
  ask: StoneOriginAsk | null,
): number | null {
  if (ask === 'natural' || ask === 'lab') {
    const groups = product.quality_price_groups;
    if (Array.isArray(groups)) {
      const prices: number[] = [];
      for (const group of groups) {
        if (!isRecord(group) || group.kind !== ask) continue;
        const min = parsePlnMajor(group.price_min_display_pl);
        if (min != null) prices.push(min);
      }
      if (prices.length) return Math.min(...prices);
    }
    if (Array.isArray(product.variants)) {
      const prices: number[] = [];
      for (const variant of product.variants) {
        if (!isRecord(variant)) continue;
        const selected = variant.selectedOptions ?? variant.options;
        if (!Array.isArray(selected)) continue;
        let quality = '';
        for (const option of selected) {
          if (!isRecord(option)) continue;
          const name = typeof option.name === 'string' ? option.name : '';
          const value = typeof option.value === 'string' ? option.value : '';
          if (/jako/i.test(name)) quality = value;
        }
        const kind = kazkaQualityKind(quality);
        if (kind !== ask) continue;
        const amount =
          parsePlnMajor(variant.price_display_pl) ??
          parsePlnMajor(
            typeof variant.price === 'object' && isRecord(variant.price)
              ? variant.price.amount
              : variant.price,
          );
        if (amount != null) prices.push(amount);
      }
      if (prices.length) return Math.min(...prices);
    }
  }
  return productMinPricePln(product);
}

export function applyTurnSearchHints<T extends Record<string, unknown>>(
  products: readonly T[],
  hints: TurnSearchHints,
  originAsk: StoneOriginAsk | null = null,
): T[] {
  let next = [...products];
  if (hints.tokens.length) {
    const narrowed = next.filter((product) => {
      const hay = foldStoneText(productHaystack(product));
      return hints.tokens.some((token) => hay.includes(foldStoneText(token)));
    });
    if (narrowed.length) next = narrowed;
  }
  if (hints.priceCapPln != null) {
    const cap = hints.priceCapPln;
    const inBudget = next.filter((product) => {
      const min = productMinPricePlnForOrigin(product, originAsk);
      return min != null && min <= cap + 0.01;
    });
    if (inBudget.length) {
      next = inBudget;
    } else if (next.length) {
      next = [...next].sort((left, right) => (productMinPricePln(left) ?? 1e12) - (productMinPricePln(right) ?? 1e12)).slice(0, 1);
      for (const product of next) {
        (product as Record<string, unknown>).budget_miss = true;
        (product as Record<string, unknown>).budget_cap_pln = cap;
      }
    }
  }
  if (hints.price) {
    const minor = (product: T): number => productMinPricePln(product) ?? 0;
    next.sort((left, right) => (hints.price === 'higher' ? minor(right) - minor(left) : minor(left) - minor(right)));
  }
  return next;
}

export function originCatalogQuery(_ask: StoneOriginAsk | null, stone?: StoneIntent | null): string {
  return stone ? shopifyStoneQuery(stone) : '';
}

export function rewriteCatalogQueryForOriginAndHints(query: string, buyerTurns: readonly string[]): string {
  const latest = buyerTurns[buyerTurns.length - 1] ?? '';
  if (isStoneOriginAssortmentQuestion(latest) || isCertificateQuestion(latest)) return query.trim();
  const hints = latestTurnSearchHints(latest);
  let next = query.trim();
  for (const token of hints.tokens) {
    if (!foldStoneText(next).includes(foldStoneText(token))) next = `${next} ${token}`.trim();
  }
  return next;
}

function cardMentionsCertificate(product: Record<string, unknown>): boolean {
  return /certyfik|certificate|gia|igi|hrd/iu.test(productHaystack(product));
}

export function originSafeLead(brand?: string): string {
  return isKazkaCatalogBrand(brand) ? KAZKA_ORIGIN_SAFE_LEAD : EPIR_ORIGIN_SAFE_LEAD;
}

export function formatOriginAssortmentReply(
  products: readonly Record<string, unknown>[],
  brand?: string,
): string {
  const mixed = pickMixedOriginCards(products, 3);
  const lead = originSafeLead(brand);
  if (!mixed.length) return `${lead} ${ORIGIN_UNKNOWN_ON_CARD}`;
  return `${lead}\n${formatOriginCardList(mixed)}`;
}

export function formatOriginMissReply(ask: StoneOriginAsk, stone?: StoneIntent | null): string {
  if (ask === 'natural' && stone) {
    return `Nie mam teraz w ofercie naturalnego kamienia „${stone.labelPl}”. Mogę pokazać pokrewny kamień naturalny z karty?`;
  }
  if (ask === 'lab' && stone) {
    return `Nie mam teraz w ofercie syntetycznego albo laboratoryjnego kamienia „${stone.labelPl}”. Mogę sprawdzić inną kartę?`;
  }
  if (ask === 'natural') {
    return `Nie mam teraz w ofercie kamienia naturalnego dla tego zapytania. Mogę pokazać pokrewny kamień naturalny z karty?`;
  }
  return `Nie mam teraz syntetycznego albo laboratoryjnego kamienia dla tego zapytania.`;
}

export function replyMakesAbsoluteOriginClaim(text: string): boolean {
  return ABSOLUTE_NATURAL.test(text) || ABSOLUTE_LAB.test(text) || ABSOLUTE_NO_DIAMOND.test(text);
}

export function replyMakesAbsoluteCertificateClaim(text: string): boolean {
  return ABSOLUTE_CERT.test(text);
}

function normalizeReply(text: string): string {
  return text.replace(/\s+/g, ' ').trim().toLocaleLowerCase('pl-PL');
}

export function isRepeatedAssistantReply(current: string, previous?: string): boolean {
  if (!previous?.trim() || !current.trim()) return false;
  return normalizeReply(current) === normalizeReply(previous);
}

export function cardsSupportOriginClaim(
  products: readonly Record<string, unknown>[],
  claim: 'natural' | 'lab' | 'diamond',
): boolean {
  if (claim === 'diamond') {
    return products.some((product) => /diament|brylant|diamond|brylancik/iu.test(productHaystack(product)));
  }
  return products.some((product) => {
    const origin = cardStoneOrigin(product);
    return origin === claim || origin === 'mixed';
  });
}

export function guardStoneOriginClaims(
  text: string,
  input: {
    buyerTurns: readonly string[];
    previousAssistant?: string;
    catalogProducts: readonly Record<string, unknown>[];
    brand?: string;
    stone?: StoneIntent | null;
  },
): {text: string; replaced: boolean; reason?: string} {
  const latest = input.buyerTurns[input.buyerTurns.length - 1] ?? '';
  const ask = originAskForTurn(input.buyerTurns);
  const assortment = isStoneOriginAssortmentQuestion(latest);
  const certAsk = isCertificateQuestion(latest);
  const products = input.catalogProducts;

  if (certAsk) {
    const anyCert = products.some(cardMentionsCertificate);
    if (replyMakesAbsoluteCertificateClaim(text) && !anyCert) {
      return {text: CERTIFICATE_UNKNOWN, replaced: true, reason: 'certificate_claim'};
    }
    if (!anyCert && /\/products\//.test(text) && !products.some((product) => cardMentionsCertificate(product))) {
      return {text: CERTIFICATE_UNKNOWN, replaced: true, reason: 'certificate_product_fallback'};
    }
  }

  if (assortment || (ask && !products.length)) {
    if (replyMakesAbsoluteOriginClaim(text) || assortment) {
      const mixed = pickMixedOriginCards(products, 3);
      if (mixed.length && (assortment || replyMakesAbsoluteOriginClaim(text))) {
        if (assortment || !citesAllowedOrigin(text, products, ask)) {
          return {text: formatOriginAssortmentReply(products, input.brand), replaced: true, reason: 'origin_assortment'};
        }
      }
    }
  }

  if (replyMakesAbsoluteOriginClaim(text)) {
    if (ABSOLUTE_NATURAL.test(text) && !cardsSupportOriginClaim(products, 'natural')) {
      return {text: formatOriginAssortmentReply(products, input.brand), replaced: true, reason: 'absolute_natural'};
    }
    if (ABSOLUTE_LAB.test(text) && !cardsSupportOriginClaim(products, 'lab')) {
      return {text: formatOriginAssortmentReply(products, input.brand), replaced: true, reason: 'absolute_lab'};
    }
    if (ABSOLUTE_NO_DIAMOND.test(text) && cardsSupportOriginClaim(products, 'diamond')) {
      return {text: formatOriginAssortmentReply(products, input.brand), replaced: true, reason: 'absolute_no_diamond'};
    }
    if (ABSOLUTE_NATURAL.test(text) && products.some((product) => cardStoneOrigin(product) === 'lab')) {
      return {text: formatOriginAssortmentReply(products, input.brand), replaced: true, reason: 'absolute_natural'};
    }
  }

  if (ask === 'natural') {
    const naturalHits = filterProductsByOriginAsk(products, 'natural');
    const onlyLab = products.length > 0 && naturalHits.length === 0;
    if (onlyLab) {
      const label = input.stone?.labelPl ?? 'kamienia';
      const lines = products.slice(0, 4).map((product) => {
        const title = typeof product.title === 'string' ? product.title : 'Pozycja';
        const url = typeof product.url === 'string' ? product.url : '';
        const origin = originOnCardLabel(product);
        const name = url ? `[${title}](${url})` : title;
        return `- ${name} — pochodzenie: ${origin}.`;
      });
      return {
        text: `Naturalnego ${label} nie mam teraz w ofercie. Karty z ${label} podają:\n${lines.join('\n')}`,
        replaced: true,
        reason: 'natural_synth_only',
      };
    }
    if (products.length === 0 && /\/products\//.test(text)) {
      return {text: formatOriginMissReply('natural', input.stone), replaced: true, reason: 'natural_synth_only'};
    }
  }

  if (ask && products.length && /karta tego nie podaje|potwierdzi pracownia/iu.test(text) === false) {
    const unknownOnly = products.every((product) => cardStoneOrigin(product) === 'unknown');
    if (unknownOnly && /naturaln|syntet|laboratoryj/iu.test(text) && !/karta/iu.test(text)) {
      return {text: ORIGIN_UNKNOWN_ON_CARD, replaced: true, reason: 'origin_unknown_card'};
    }
  }

  if (isRepeatedAssistantReply(text, input.previousAssistant)) {
    const hints = latestTurnSearchHints(latest);
    const refreshed = applyTurnSearchHints(products, hints);
    if (refreshed.length) {
      return {text: formatOriginCardList(refreshed), replaced: true, reason: 'repeat_turn'};
    }
    return {
      text: 'Doprecyzowałam wyszukiwanie w tej turze. Napisz proszę jeszcze raz, jeśli lista ma zostać inna.',
      replaced: true,
      reason: 'repeat_turn',
    };
  }

  return {text, replaced: false};
}

function citesAllowedOrigin(
  text: string,
  products: readonly Record<string, unknown>[],
  ask: StoneOriginAsk | null,
): boolean {
  if (!ask) return /\/products\//.test(text);
  return filterProductsByOriginAsk(products, ask).some((product) => {
    const url = typeof product.url === 'string' ? product.url : '';
    return Boolean(url) && text.includes(url);
  });
}

export function originAssortmentSearchQueries(brand?: string): string[] {
  if (isKazkaCatalogBrand(brand)) {
    return ['brylant soliter', 'lab brylant', 'big lab'];
  }
  return ['naturalny kamień', 'syntetyczny szafir', 'laboratoryjny'];
}
