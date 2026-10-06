/**
 * Ostatnia siatka odpowiedzi: fałszywy brak kamienia, cicha podmiana, urwany tekst.
 * Lista pozycji bierze się z kart, które worker już dostał — model jej nie wymyśla.
 */

import {extractCatalogProducts, productMatchesStone} from './stone-retrieval';
import {detectPolicyInformationIntent} from '../intent/policy-information';
import {
  detectStoneOriginAsk,
  formatOriginMissReply,
  guardStoneOriginClaims,
  isCertificateQuestion,
  isStoneOriginAssortmentQuestion,
} from './stone-origin';
import {
  buyerAllowsStoneSubstitute,
  detectStoneIntent,
  discoveryMetalBrowse,
  latestTurnClearsProductContext,
  otherStoneMentioned,
  productLooksLikeRing,
  productMatchesDiscoveryMetal,
  stoneIntentFromConversation,
  textMentionsStone,
  type StoneIntent,
} from './stone-intent';

const FALSE_EMPTY =
  /nie ma (?:produkt|biżuter|bizuter|pierścion|pierscion|obrącz|obracz|ofert)|w (?:naszej |naszym )?(?:ofercie|katalogu|kolekcji) nie ma|brak (?:produkt|biżuter|bizuter|pierścion|ofert)|nie mamy (?:w ofercie|biżuter|bizuter|produkt|pierścion)|opisanych wyłącznie|nie znalazł[aąe]m|nie mam teraz w ofercie/iu;

const MASKED_FAILURE =
  /Nie udało się ułożyć odpowiedzi|Nie mogę podać pewnej ceny|Jeszcze nie potwierdziłam kart/iu;

const HANDOFF = /^\s*łączę z asystentem\b|^\s*lacze z asystentem\b/iu;

const DISCOVERY_META_LEAK = /nie wracam do poprzedniej|metal bior[eę] z karty/iu;

export const BUYER_RETRY_REPLY =
  'Nie udało się ułożyć odpowiedzi. Napisz proszę jeszcze raz — zostaję przy tym, o co prosisz.';

export const STALE_PRODUCT_CONTEXT_REPLY =
  'Przy tej próbie nie wracam do poprzedniej listy. Metal biorę z karty produktu, o który pytasz.';

export function isGarbledBuyerText(text: string): boolean {
  const compact = text.replace(/https?:\/\/\S+/g, '').replace(/\s+/g, '');
  if (compact.length < 8) return false;
  if (/(.)\1{5,}/u.test(compact)) return true;
  if (/(.{2})\1/u.test(compact)) return true;
  if (/(\p{L}{3,5})\1/u.test(compact)) return true;
  return false;
}

export function isHandoffShell(text: string): boolean {
  const normalized = text.replace(/[.!?…]/g, '').trim();
  return HANDOFF.test(normalized) && normalized.length < 90;
}

export function productsFromCatalogSnapshots(snapshots: readonly unknown[]): Record<string, unknown>[] {
  const out: Record<string, unknown>[] = [];
  const seen = new Set<string>();
  for (const snapshot of snapshots) {
    for (const product of extractCatalogProducts(snapshot)) {
      const key =
        (typeof product.handle === 'string' && product.handle) ||
        (typeof product.url === 'string' && product.url) ||
        (typeof product.title === 'string' && product.title) ||
        '';
      if (!key || seen.has(key)) continue;
      seen.add(key);
      out.push(product);
    }
  }
  return out;
}

function metalFact(title: string): string | undefined {
  if (/srebrn/iu.test(title)) return 'srebro';
  if (/z[łl]ot/iu.test(title)) return 'złoto';
  if (/platyn/iu.test(title)) return 'platyna';
  return undefined;
}

function factFromCard(product: Record<string, unknown>): string | undefined {
  const title = typeof product.title === 'string' ? product.title : '';
  const metal = metalFact(title);
  if (metal) return metal;
  const main = typeof product.main_stone === 'string' ? product.main_stone.trim() : '';
  if (main) return main;
  const description = typeof product.description === 'string' ? product.description.trim() : '';
  if (!description) return undefined;
  const sentence = description.split(/(?<=[.!?])\s/)[0]?.trim() ?? '';
  if (!sentence) return undefined;
  return sentence.length > 90 ? `${sentence.slice(0, 89).trimEnd()}…` : sentence;
}

function stringList(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value.filter((item): item is string => typeof item === 'string' && item.trim().length > 0);
}

function karatLabels(product: Record<string, unknown>): string[] {
  if (!Array.isArray(product.options)) return [];
  const out: string[] = [];
  for (const option of product.options) {
    if (!option || typeof option !== 'object') continue;
    const name = (option as {name?: unknown}).name;
    const values = (option as {values?: unknown}).values;
    if (typeof name !== 'string' || !/pr[oó]b|karat/iu.test(name)) continue;
    out.push(...stringList(values));
  }
  return out;
}

/**
 * Cena nie jest jedna: metal, próba i kamień zmieniają kwotę.
 * Nie zaczynamy od „od X zł” i nie bierzemy ceny pierwszego wariantu.
 */
function variantSpread(product: Record<string, unknown>): string {
  const metals = stringList(product.metals).join(', ');
  const karats = karatLabels(product).join(', ');
  const stone = typeof product.main_stone === 'string' ? product.main_stone.trim() : '';
  const min = typeof product.price_min_display_pl === 'string' ? product.price_min_display_pl : '';
  const max = typeof product.price_max_display_pl === 'string' ? product.price_max_display_pl : '';
  const bits = ['warianty różnią się metalem, próbą albo kamieniem'];
  if (metals) bits.push(`metale ${metals}`);
  if (karats) bits.push(`próby ${karats}`);
  if (stone) bits.push(`kamień ${stone}`);
  if (min && max) bits.push(`zakres karty ${min}–${max}`);
  return bits.join(', ');
}

export function productPriceVaries(product: Record<string, unknown>): boolean {
  return (
    product.price_is_flat === false &&
    typeof product.price_min_display_pl === 'string' &&
    typeof product.price_max_display_pl === 'string'
  );
}

function priceLabel(product: Record<string, unknown>): string {
  if (product.price_is_flat === true && typeof product.price_display_pl === 'string') return product.price_display_pl;
  if (productPriceVaries(product)) return variantSpread(product);
  if (typeof product.page_price_display_pl === 'string' && !product.page_price_display_pl.startsWith('od ')) {
    return product.page_price_display_pl;
  }
  if (typeof product.price_display_pl === 'string') return product.price_display_pl;
  return '';
}

function lineForProduct(product: Record<string, unknown>): string {
  const title = typeof product.title === 'string' && product.title.trim() ? product.title.trim() : 'Pozycja z katalogu';
  const url = typeof product.url === 'string' ? product.url.trim() : '';
  const sizes = typeof product.sizes_label === 'string' && product.sizes_label.trim() ? `rozmiary ${product.sizes_label.trim()}` : '';
  const metals = Array.isArray(product.metals)
    ? product.metals.filter((value): value is string => typeof value === 'string' && value.trim().length > 0).join(', ')
    : '';
  const fact = factFromCard(product)?.replace(/[.!?…]+$/u, '');
  const name = url ? `[${title}](${url})` : title;
  const metalsLine = productPriceVaries(product) || !metals ? '' : `metale ${metals}`;
  const factLine =
    fact && metalsLine.toLocaleLowerCase('pl-PL').includes(fact.toLocaleLowerCase('pl-PL')) ? '' : fact;
  const detail = [priceLabel(product), sizes, metalsLine, factLine].filter(Boolean).join(', ');
  return detail ? `- ${name} — ${detail}.` : `- ${name}.`;
}

export function formatCatalogBrowseReply(products: readonly Record<string, unknown>[]): string {
  const shown = products.slice(0, 4);
  const lines = shown.map(lineForProduct);
  const ask = shown.some(productPriceVaries) ? '\nKtóry wariant Cię interesuje?' : '';
  return `Te pozycje są w katalogu:\n${lines.join('\n')}${ask}`;
}

export function formatStoneBrowseReply(products: readonly Record<string, unknown>[], intent: StoneIntent): string {
  const lines = products.slice(0, 4).map(lineForProduct);
  return `Te pozycje mają w karcie kamień ${intent.labelPl}:\n${lines.join('\n')}\nMogę zawęzić do pierścionka, obrączki albo innego rodzaju.`;
}

export function formatStoneUnconfirmedReply(intent: StoneIntent): string {
  return `Jeszcze nie potwierdziłam kart z kamieniem „${intent.labelPl}”. Napisz proszę jeszcze raz — zostaję przy tym kamieniu.`;
}

export function formatStoneMissReply(intent: StoneIntent): string {
  return `Nie mam teraz w ofercie kamienia „${intent.labelPl}”. Mogę pokazać inny kamień?`;
}

function citesProduct(reply: string, products: readonly Record<string, unknown>[]): boolean {
  return products.some((product) => {
    const url = typeof product.url === 'string' ? product.url : '';
    return Boolean(url) && reply.includes(url);
  });
}

export type StoneLookup = 'none' | 'hit' | 'confirmed_miss' | 'unconfirmed';

export type BuyerReplyContext = {
  buyerTurns: readonly string[];
  previousAssistant?: string;
  catalogSnapshots: readonly unknown[];
  /** none = retrieval jeszcze nie zaszedł. Pusta lista bez confirmed_miss nie jest brakiem oferty. */
  stoneLookup?: StoneLookup;
  brand?: string;
};

function discoveryMetalCards(
  snapshots: readonly unknown[],
  metal: 'srebro' | 'złoto' | 'platyna',
): Record<string, unknown>[] {
  return productsFromCatalogSnapshots(snapshots).filter(
    (product) => productLooksLikeRing(product) && productMatchesDiscoveryMetal(product, metal),
  );
}

export function guardBuyerCatalogReply(text: string, context: BuyerReplyContext): {text: string; replaced: boolean; reason?: string} {
  const latest = context.buyerTurns[context.buyerTurns.length - 1] ?? '';
  const catalogProducts = productsFromCatalogSnapshots(context.catalogSnapshots);
  const namedNow = detectStoneIntent(latest);
  const originAsk = detectStoneOriginAsk(latest);
  const originGuarded = guardStoneOriginClaims(text, {
    buyerTurns: context.buyerTurns,
    previousAssistant: context.previousAssistant,
    catalogProducts,
    brand: context.brand,
    stone: namedNow ?? stoneIntentFromConversation(context.buyerTurns),
  });
  if (originGuarded.replaced) return originGuarded;
  if (isCertificateQuestion(latest) || detectPolicyInformationIntent(latest).match) {
    return {text, replaced: false};
  }
  if (isStoneOriginAssortmentQuestion(latest)) {
    return {text, replaced: false};
  }
  const metalBrowse = discoveryMetalBrowse(context.buyerTurns);
  if (metalBrowse) {
    const shown = discoveryMetalCards(context.catalogSnapshots, metalBrowse.metal);
    const leaks = DISCOVERY_META_LEAK.test(text);
    if (shown.length && (leaks || !citesProduct(text, shown) || isGarbledBuyerText(text) || FALSE_EMPTY.test(text))) {
      return {text: formatCatalogBrowseReply(shown), replaced: true, reason: 'discovery_metal'};
    }
    if (leaks) {
      return {
        text: `Nie mam teraz w ofercie klasycznego pierścionka w metalu „${metalBrowse.metal}”. Mogę sprawdzić inny metal?`,
        replaced: true,
        reason: 'discovery_metal',
      };
    }
  }
  const priorTurns = context.buyerTurns.slice(0, -1);
  if (!metalBrowse && priorTurns.length && latestTurnClearsProductContext(latest, priorTurns)) {
    const prior = stoneIntentFromConversation(priorTurns);
    const citesPriorStone = Boolean(prior && textMentionsStone(text, prior));
    const citesSku = /\/products\//.test(text);
    if (citesPriorStone || citesSku) {
      return {text: STALE_PRODUCT_CONTEXT_REPLY, replaced: true, reason: 'stale_product_context'};
    }
  }
  const allowSubstitute = buyerAllowsStoneSubstitute(latest, context.previousAssistant);
  const intent = allowSubstitute ? null : stoneIntentFromConversation(context.buyerTurns);
  const products = intent ? catalogProducts.filter((product) => productMatchesStone(product, intent)) : [];
  const broken = isGarbledBuyerText(text) || isHandoffShell(text) || MASKED_FAILURE.test(text);
  const unconfirmedNote = context.catalogSnapshots.some((snapshot) =>
    JSON.stringify(snapshot).includes('Nie udało się potwierdzić'),
  );
  const lookup: StoneLookup =
    context.stoneLookup ?? (unconfirmedNote ? 'unconfirmed' : products.length ? 'hit' : 'none');
  if (!intent) {
    const falseEmpty = FALSE_EMPTY.test(text) && !citesProduct(text, catalogProducts);
    if ((falseEmpty || broken) && catalogProducts.length) {
      return {text: formatCatalogBrowseReply(catalogProducts), replaced: true, reason: falseEmpty ? 'false_empty' : 'garbled'};
    }
    if (falseEmpty && lookup === 'unconfirmed') {
      return {
        text: 'Jeszcze nie potwierdziłam tej pozycji w katalogu. Napisz proszę jeszcze raz.',
        replaced: true,
        reason: 'unconfirmed',
      };
    }
    if (!broken) return {text, replaced: false};
    return {text: BUYER_RETRY_REPLY, replaced: true, reason: 'garbled'};
  }
  const substitutes = otherStoneMentioned(text, intent) && !textMentionsStone(text, intent);
  const falseEmpty = FALSE_EMPTY.test(text) && !citesProduct(text, products);
  if (!broken && !substitutes && !falseEmpty) return {text, replaced: false};
  if (products.length) {
    return {
      text: formatStoneBrowseReply(products, intent),
      replaced: true,
      reason: broken ? 'garbled' : substitutes ? 'substitute' : 'false_empty',
    };
  }
  const missIntent = namedNow ?? intent;
  if (lookup === 'confirmed_miss' && (substitutes || falseEmpty || broken)) {
    if (originAsk) {
      return {text: formatOriginMissReply(originAsk, missIntent), replaced: true, reason: 'origin_miss'};
    }
    if (!namedNow) {
      return {text: formatStoneUnconfirmedReply(intent), replaced: true, reason: 'unconfirmed'};
    }
    return {text: formatStoneMissReply(missIntent), replaced: true, reason: substitutes ? 'substitute' : 'false_empty'};
  }
  if (substitutes || falseEmpty || broken || lookup === 'unconfirmed' || lookup === 'none') {
    return {text: formatStoneUnconfirmedReply(intent), replaced: true, reason: 'unconfirmed'};
  }
  return {text: BUYER_RETRY_REPLY, replaced: true, reason: 'garbled'};
}
