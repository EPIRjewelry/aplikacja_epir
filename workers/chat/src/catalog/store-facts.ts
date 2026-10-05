/**
 * Fakty sklepu, których model nie może uogólnić ani przenieść między markami.
 * EPIR: próg 500 zł tylko dla srebra. Darmowa wysyłka złota tylko, gdy fakt jest podany.
 * Kazka: wysyłka z polityki tego sklepu, zamówienia indywidualne i zmiana rozmiaru.
 */

import {detectPolicyInformationIntent} from '../intent/policy-information';
import {isKazkaCatalogBrand, isEpirFamilyCatalogBrand} from './kazka-assortment';

export const EPIR_SHIPPING_FACT = 'Srebro: wysyłka 15 zł, darmowa od 500 zł.';

/**
 * Puste: nie twierdzimy, że złoto EPIR jedzie bezpłatnie.
 * Niepusty string jest jedyną dozwoloną formą tej obietnicy.
 */
export const EPIR_GOLD_FREE_SHIPPING_FACT = '';

export const KAZKA_SHIPPING_FACT =
  'Wysyłkę Kazka podaję z polityki tego sklepu, nie z zasad innej linii.';

export const KAZKA_RETURNS_FACT =
  'Przyjmujemy zamówienia indywidualne. Pierścionek na zamówienie ma jedną darmową zmianę rozmiaru. To nie jest standardowy zwrot.';

export const KAZKA_ASSORTMENT_FACT =
  'Asortyment Kazka jest w kartach tego katalogu. Nie opisuję osobnej linii srebra.';

export const HARDNESS_FACT = 'Nie porównuję twardości metali. Metal biorę z karty produktu.';

const HARDNESS =
  /mniej podatn\p{L}* na zarysowan|bardziej podatn\p{L}* na zarysowan|twardsz|\bmohs\b|skala mohsa|odporn\p{L}* na zarysowan/iu;

const EPIR_500 =
  /(?:darmow\p{L}*\s+(?:wysyłk|dostaw)|free shipping)[^.?!]{0,48}500|500\s*zł[^.?!]{0,48}(?:darmow|wysyłk|dostaw|free shipping)/iu;

const EPIR_15 = /wysyłk\p{L}*\s+15\s*zł|15\s*zł[^.?!]{0,24}wysyłk|15\s*zł[^.?!]{0,24}darmow/iu;

const KAZKA_RETURN_14 = /14\s*dni[^.?!]{0,48}zwrot|zwrot[^.?!]{0,48}14\s*dni/iu;

const REFUSES_RETURNS = /nie\s+przyjmuj\p{L}*[^.]{0,48}zwrot|zwrot\p{L}*[^.]{0,40}nie\s+przyjmuj/iu;

const REFUSES_CUSTOM =
  /nie\s+przyjmuj\p{L}*[^.]{0,80}zam[oó]wie\p{L}*\s+indywidual|zam[oó]wie\p{L}*\s+indywidual[^.]{0,48}nie\s+przyjmuj/iu;

const PRODUCT_DRIFT = /\/products\/|\bnaszyjnik\s+iluzja\b|\biluzja\b/iu;

const GOLD_FREE_SHIPPING =
  /z[łl]ot\p{L}*(?:[^.]{0,80})(?:darmow\p{L}*|bezpłatn\p{L}*|bezplatn\p{L}*|ubezpieczon\p{L}*\s+dostaw|free\s+shipping)|(?:darmow\p{L}*|bezpłatn\p{L}*|bezplatn\p{L}*)(?:[^.]{0,80})z[łl]ot/iu;

export type StoreFactOptions = {
  userMessage?: string;
  /** Gdy brak albo pusty string, zdanie o darmowej wysyłce złota EPIR odpada. */
  goldFreeShippingFact?: string | null;
};

const KAZKA_SILVER = /kazka[^.?!]{0,80}\bsrebr|\bsrebr[^.?!]{0,80}kazka/iu;

const NOT_PART_OF_EPIR = /nie\s+(?:jest\s+)?części[aą]\s+epir|nie\s+należy\s+do\s+epir/iu;

const SILVER_WORD = /srebr/iu;

function sentencesOf(text: string): string[] {
  return text
    .split(/(?<=[.!?])\s+/)
    .map((part) => part.trim())
    .filter((part) => part.length > 0);
}

export function storeFactContextLine(brand?: string): string {
  if (isKazkaCatalogBrand(brand)) {
    return `Fakt sklepu Kazka: ${KAZKA_SHIPPING_FACT} ${KAZKA_RETURNS_FACT} ${KAZKA_ASSORTMENT_FACT} ${HARDNESS_FACT}`;
  }
  if (isEpirFamilyCatalogBrand(brand) || !brand) {
    return `Fakt sklepu EPIR: ${EPIR_SHIPPING_FACT} ${HARDNESS_FACT}`;
  }
  return `Fakt sklepu EPIR: ${EPIR_SHIPPING_FACT} ${HARDNESS_FACT}`;
}

export function promotionRulesForBrand(rules: string, brand?: string): string {
  if (!rules.trim()) return rules;
  if (!isKazkaCatalogBrand(brand)) return rules;
  if (/500|free shipping|darmow\p{L}*\s+(?:wysył|dostaw)/iu.test(rules)) return '';
  return rules;
}

function kazkaPolicyReplacement(userMessage: string | undefined): string | null {
  if (!userMessage || !detectPolicyInformationIntent(userMessage).match) return null;
  if (/zwrot|reklamac|odst[aą]p/iu.test(userMessage)) return KAZKA_RETURNS_FACT;
  if (/wysy[lł]|dostaw/iu.test(userMessage)) return KAZKA_SHIPPING_FACT;
  return `${KAZKA_SHIPPING_FACT} ${KAZKA_RETURNS_FACT}`;
}

export function guardStoreFacts(
  text: string,
  brand?: string,
  options?: StoreFactOptions,
): {text: string; replaced: boolean; reason?: string} {
  const parts = sentencesOf(text);
  if (!parts.length) return {text, replaced: false};
  const kazka = isKazkaCatalogBrand(brand);
  const goldFact = options?.goldFreeShippingFact ?? EPIR_GOLD_FREE_SHIPPING_FACT;
  const groundedGold = typeof goldFact === 'string' ? goldFact.trim() : '';
  const policyFact = kazka ? kazkaPolicyReplacement(options?.userMessage) : null;
  const next: string[] = [];
  let replaced = false;
  let shippingOnce = false;
  let returnsOnce = false;
  let assortmentOnce = false;
  let hardnessOnce = false;
  let policyOnce = false;
  let goldOnce = false;

  for (const sentence of parts) {
    if (policyFact && (PRODUCT_DRIFT.test(sentence) || REFUSES_RETURNS.test(sentence) || REFUSES_CUSTOM.test(sentence))) {
      replaced = true;
      if (!policyOnce) {
        next.push(policyFact);
        policyOnce = true;
      }
      continue;
    }
    if (HARDNESS.test(sentence)) {
      replaced = true;
      if (!hardnessOnce) {
        next.push(HARDNESS_FACT);
        hardnessOnce = true;
      }
      continue;
    }
    if (kazka && (KAZKA_SILVER.test(sentence) || NOT_PART_OF_EPIR.test(sentence))) {
      replaced = true;
      if (!assortmentOnce) {
        next.push(KAZKA_ASSORTMENT_FACT);
        assortmentOnce = true;
      }
      continue;
    }
    if (kazka && (REFUSES_RETURNS.test(sentence) || REFUSES_CUSTOM.test(sentence) || KAZKA_RETURN_14.test(sentence))) {
      replaced = true;
      if (!returnsOnce) {
        next.push(KAZKA_RETURNS_FACT);
        returnsOnce = true;
      }
      continue;
    }
    if (kazka && (EPIR_500.test(sentence) || EPIR_15.test(sentence))) {
      replaced = true;
      if (!shippingOnce) {
        next.push(KAZKA_SHIPPING_FACT);
        shippingOnce = true;
      }
      continue;
    }
    if (!kazka && GOLD_FREE_SHIPPING.test(sentence)) {
      replaced = true;
      if (groundedGold && !goldOnce) {
        next.push(groundedGold);
        goldOnce = true;
      }
      continue;
    }
    if (!kazka && EPIR_500.test(sentence) && !SILVER_WORD.test(sentence)) {
      replaced = true;
      if (!shippingOnce) {
        next.push(EPIR_SHIPPING_FACT);
        shippingOnce = true;
      }
      continue;
    }
    next.push(sentence);
  }

  if (!replaced) return {text, replaced: false};
  const joined = next.join(' ').trim();
  return {text: joined || (kazka ? KAZKA_SHIPPING_FACT : EPIR_SHIPPING_FACT), replaced: true, reason: 'store_fact'};
}
