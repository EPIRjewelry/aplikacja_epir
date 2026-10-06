/**
 * Karta produktu z bieżącej strony.
 * Cena, rozmiary i kamień biorą się z tej karty. Inny SKU nie dokleja swojej kwoty.
 */

import {detectSizeTableIntent} from '../intent/size-table';
import {extractPlnAmountsFromAssistantText, parsePlnAmountToken} from '../pricing-guard';
import {presentCatalogForModel} from '../mcp/catalog-for-model';
import {isEpirFamilyCatalogBrand, isKazkaAssortment, isKazkaCatalogBrand} from './kazka-assortment';
import {fetchStoreProductsByQuery, type StoneCatalogEnv} from './stone-retrieval';
import {formatCatalogBrowseReply, isGarbledBuyerText} from './buyer-reply-guard';

const PAGE_NOTE =
  'To jest karta produktu otwartego na stronie. Odpowiadaj tylko z niej. Nie pisz, że produktu nie ma.';

const NOT_ON_CARD =
  /nie znalazł|nie udało się ułożyć|nie mogę podać pewnej ceny|nie mam teraz w ofercie|nie widzę (?:tej|tego)|brak (?:tej |tego )?karty|jeszcze nie potwierdziłam kart/iu;

const POLICY_QUESTION = /wysyłk|dostaw|zwrot|reklamac|regulamin|polityk/iu;
const PRODUCT_DEMONSTRATIVE = /\b(t[aąeę]|ten|tej|tego|tą|to)\b/iu;

export function buyerAsksAboutPageProduct(message: string): boolean {
  const text = message.trim();
  if (!text) return false;
  if (detectSizeTableIntent(text).match) return false;
  if (POLICY_QUESTION.test(text) && !PRODUCT_DEMONSTRATIVE.test(text)) return false;
  const browseAway =
    /\b(?:co[sś] z|pokaz|pokaż)\b/iu.test(text) &&
    /\b(?:kilka|inne|szafir|sapphire|diament|brylant|turmalin|kamien)/iu.test(text);
  if (browseAway && !PRODUCT_DEMONSTRATIVE.test(text)) return false;
  return true;
}

export function brandKeepsProduct(product: Record<string, unknown>, brand?: string): boolean {
  const vendor = typeof product.vendor === 'string' ? product.vendor : null;
  const tags = Array.isArray(product.tags) ? product.tags.filter((tag): tag is string => typeof tag === 'string') : [];
  if (!vendor && tags.length === 0) return false;
  const kazka = isKazkaAssortment({vendor, tags});
  if (isKazkaCatalogBrand(brand)) return kazka;
  if (isEpirFamilyCatalogBrand(brand) || !brand) return !kazka;
  return true;
}

export function readPresentedProducts(snapshot: unknown): Record<string, unknown>[] {
  if (!snapshot || typeof snapshot !== 'object') return [];
  const text = (snapshot as {content?: Array<{text?: string}>}).content?.[0]?.text;
  if (!text) return [];
  try {
    const parsed = JSON.parse(text) as {products?: unknown};
    if (!Array.isArray(parsed.products)) return [];
    return parsed.products.filter((item): item is Record<string, unknown> => Boolean(item) && typeof item === 'object');
  } catch {
    return [];
  }
}

export function formatPageCardContext(card: Record<string, unknown>): string {
  return `[KARTA PRODUKTU NA TEJ STRONIE]\n${JSON.stringify(card)}\nOdpowiadaj o tym produkcie wyłącznie z tej karty. Nie pisz, że go nie ma. Gdy price_is_flat jest false, podaj zakres od price_min_display_pl do price_max_display_pl i pełne sizes_label. Nie dopisuj ceny ani kamienia z innego SKU.`;
}

export function formatPageCardReply(card: Record<string, unknown>): string {
  const title = typeof card.title === 'string' && card.title.trim() ? card.title.trim() : 'Ten produkt';
  const url = typeof card.url === 'string' ? card.url.trim() : '';
  const name = url ? `[${title}](${url})` : title;
  let price = '';
  if (typeof card.price_display_pl === 'string' && card.price_is_flat !== false) {
    price = card.price_display_pl;
  } else if (typeof card.price_min_display_pl === 'string' && typeof card.price_max_display_pl === 'string') {
    price = `od ${card.price_min_display_pl} do ${card.price_max_display_pl}`;
  } else if (typeof card.page_price_display_pl === 'string') {
    price = card.page_price_display_pl;
  }
  const sizes =
    typeof card.sizes_label === 'string' && card.sizes_label.trim()
      ? `rozmiary ${card.sizes_label.trim()}`
      : '';
  const metals = metalsPhrase(card);
  const stone = typeof card.main_stone === 'string' && card.main_stone.trim() ? card.main_stone.trim() : '';
  const detail = [price, sizes, metals, stone].filter(Boolean).join(', ');
  return detail ? `${name} — ${detail}.` : `${name}.`;
}

function amountsOnCard(card: Record<string, unknown>): number[] {
  return extractPlnAmountsFromAssistantText(
    JSON.stringify({
      price_display_pl: card.price_display_pl,
      page_price_display_pl: card.page_price_display_pl,
      price_min_display_pl: card.price_min_display_pl,
      price_max_display_pl: card.price_max_display_pl,
      variants: card.variants,
    }),
  );
}

function replyHasAmount(text: string, display: string): boolean {
  if (!display) return true;
  if (text.includes(display)) return true;
  const expected = parsePlnAmountToken(display.replace(/[^\d\s,.]/g, ''));
  if (expected === null) return false;
  return extractPlnAmountsFromAssistantText(text).some((amount) => Math.abs(amount - expected) < 0.5);
}

function replyQuotesCardPrice(text: string, card: Record<string, unknown>): boolean {
  if (card.price_is_flat === true) {
    return replyHasAmount(text, typeof card.price_display_pl === 'string' ? card.price_display_pl : '');
  }
  const min = typeof card.price_min_display_pl === 'string' ? card.price_min_display_pl : '';
  const max = typeof card.price_max_display_pl === 'string' ? card.price_max_display_pl : '';
  if (!min) return true;
  return replyHasAmount(text, min) && (!max || replyHasAmount(text, max)) && /od\s+\d/iu.test(text);
}

function replyHasSizes(text: string, card: Record<string, unknown>): boolean {
  const label = typeof card.sizes_label === 'string' ? card.sizes_label.trim() : '';
  if (!label) return true;
  return text.includes(label) || text.includes(label.replace('–', '-'));
}

function metalValues(card: Record<string, unknown>): string[] {
  if (!Array.isArray(card.metals)) return [];
  return card.metals.filter((value): value is string => typeof value === 'string' && value.trim().length > 0);
}

function metalsPhrase(card: Record<string, unknown>): string {
  const values = metalValues(card);
  if (!values.length) return '';
  return `metale ${values.join(', ')}`;
}

function replyHasMetals(text: string, card: Record<string, unknown>): boolean {
  const values = metalValues(card);
  if (!values.length) return true;
  const folded = text.toLocaleLowerCase('pl-PL');
  return values.every((value) => folded.includes(value.toLocaleLowerCase('pl-PL')));
}

export function guardPageProductReply(
  text: string,
  card: Record<string, unknown>,
): {text: string; replaced: boolean; reason?: string} {
  const close = formatPageCardReply(card);
  if (NOT_ON_CARD.test(text) || isGarbledBuyerText(text)) return {text: close, replaced: true, reason: 'page_card'};
  const allowed = amountsOnCard(card);
  const stated = extractPlnAmountsFromAssistantText(text);
  const foreign = stated.filter((amount) => !allowed.some((known) => Math.abs(known - amount) < 0.5));
  const quotesPrice = stated.length > 0 || /zł|rozmiar/iu.test(text);
  if (!quotesPrice) return {text, replaced: false};
  if (foreign.length || !replyQuotesCardPrice(text, card) || !replyHasSizes(text, card) || !replyHasMetals(text, card)) {
    return {text: close, replaced: true, reason: 'page_card_facts'};
  }
  return {text, replaced: false};
}

function cardEdgeMajor(card: Record<string, unknown>, key: 'price_min_display_pl' | 'price_max_display_pl'): number | null {
  if (card.price_is_flat === true) return null;
  const label = typeof card[key] === 'string' ? card[key] : '';
  if (!label) return null;
  return parsePlnAmountToken(label.replace(/[^\d\s,.]/g, ''));
}

function cardMinMajor(card: Record<string, unknown>): number | null {
  return cardEdgeMajor(card, 'price_min_display_pl');
}

/**
 * Discovery przy różnych wariantach nie zaczyna się od „od X zł”.
 * Ani minimum karty, ani droższy pierwszy wariant nie jest „tą” ceną.
 * Odpowiedź mówi, że metal, próba i kamień zmieniają kwotę, podaje zakres całej karty i pyta, który wariant.
 */
export function guardDiscoveryFromPrice(
  text: string,
  cards: readonly Record<string, unknown>[],
): {text: string; replaced: boolean; reason?: string} {
  const varying = cards.filter(
    (card) =>
      card.price_is_flat === false &&
      typeof card.price_min_display_pl === 'string' &&
      typeof card.price_max_display_pl === 'string',
  );
  if (varying.length) {
    const leadsWithFrom = /\bod\s+\d/iu.test(text);
    const asks = /wariant/iu.test(text) && /kt[oó]r/iu.test(text);
    const allowed = varying.flatMap((card) => {
      const min = cardMinMajor(card);
      const max = cardEdgeMajor(card, 'price_max_display_pl');
      return [min, max].filter((amount): amount is number => amount !== null);
    });
    const stated = extractPlnAmountsFromAssistantText(text);
    const foreign = stated.filter((amount) => !allowed.some((known) => Math.abs(known - amount) < 0.5));
    if (leadsWithFrom || foreign.length > 0 || !asks) {
      return {text: formatCatalogBrowseReply(cards), replaced: true, reason: 'variant_choice'};
    }
    return {text, replaced: false};
  }
  const mins = cards
    .map((card) => cardMinMajor(card))
    .filter((amount): amount is number => amount !== null);
  if (!mins.length) return {text, replaced: false};
  const fromRe = /od\s+(\d{1,3}(?:[ \u00a0]\d{3})+(?:[.,]\d{1,2})?|\d+(?:[.,]\d{1,2})?)/giu;
  let mismatch = false;
  for (const match of text.matchAll(fromRe)) {
    const amount = parsePlnAmountToken(match[1] ?? '');
    if (amount === null) continue;
    if (!mins.some((min) => Math.abs(min - amount) < 0.5)) mismatch = true;
  }
  if (!mismatch) return {text, replaced: false};
  return {text: formatCatalogBrowseReply(cards), replaced: true, reason: 'from_price'};
}

export function guardForeignCatalogPrices(
  text: string,
  cards: readonly Record<string, unknown>[],
): {text: string; replaced: boolean; reason?: string} {
  if (!cards.length) return {text, replaced: false};
  const allowed = cards.flatMap((card) => amountsOnCard(card));
  if (!allowed.length) return {text, replaced: false};
  const stated = extractPlnAmountsFromAssistantText(text);
  const foreign = stated.filter((amount) => !allowed.some((known) => Math.abs(known - amount) < 0.5));
  if (!foreign.length) return {text, replaced: false};
  return {text: formatCatalogBrowseReply(cards), replaced: true, reason: 'foreign_price'};
}

export async function loadPageProductCard(
  env: StoneCatalogEnv,
  handle: string,
  brand?: string,
): Promise<{card: Record<string, unknown>; snapshot: unknown} | null> {
  const slug = handle.trim();
  if (!slug) return null;
  const found = await fetchStoreProductsByQuery(env, `handle:${slug}`);
  if (!found.ok || !found.products.length) return null;
  const product = found.products.find((item) => item.handle === slug) ?? found.products[0];
  if (!product || !brandKeepsProduct(product, brand)) return null;
  const snapshot = presentCatalogForModel({products: [product], system_note: PAGE_NOTE}, {brand});
  const card = readPresentedProducts(snapshot)[0];
  if (!card) return null;
  return {card, snapshot};
}
