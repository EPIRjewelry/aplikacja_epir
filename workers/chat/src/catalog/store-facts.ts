/**
 * Fakty sklepu, których model nie może uogólnić ani przenieść między markami.
 * EPIR: próg 500 zł tylko dla srebra. Kazka: własna wysyłka i zwrot rozmiaru, bez linii srebra.
 */

import {isKazkaCatalogBrand, isEpirFamilyCatalogBrand} from './kazka-assortment';

export const EPIR_SHIPPING_FACT =
  'Srebro: wysyłka 15 zł, darmowa od 500 zł. Złoto: darmowa, ubezpieczona dostawa.';

export const KAZKA_SHIPPING_FACT =
  'Na Kazka wysyłkę biorę tylko z polityki sklepu, nie z zasad EPIR. Pierścionek na zamówienie: jedna darmowa zmiana rozmiaru, bez standardowego zwrotu.';

export const KAZKA_ASSORTMENT_FACT =
  'Asortyment Kazka jest w kartach tego katalogu. Nie opisuję osobnej linii srebra.';

export const HARDNESS_FACT = 'Nie porównuję twardości metali. Metal biorę z karty produktu.';

const HARDNESS =
  /mniej podatn\p{L}* na zarysowan|bardziej podatn\p{L}* na zarysowan|twardsz|\bmohs\b|skala mohsa|odporn\p{L}* na zarysowan/iu;

const EPIR_500 =
  /(?:darmow\p{L}*\s+(?:wysyłk|dostaw)|free shipping)[^.?!]{0,48}500|500\s*zł[^.?!]{0,48}(?:darmow|wysyłk|dostaw|free shipping)/iu;

const EPIR_15 = /wysyłk\p{L}*\s+15\s*zł|15\s*zł[^.?!]{0,24}wysyłk|15\s*zł[^.?!]{0,24}darmow/iu;

const KAZKA_RETURN_14 = /14\s*dni[^.?!]{0,48}zwrot|zwrot[^.?!]{0,48}14\s*dni/iu;

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
    return `Fakt sklepu Kazka: ${KAZKA_SHIPPING_FACT} ${KAZKA_ASSORTMENT_FACT} ${HARDNESS_FACT}`;
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

export function guardStoreFacts(
  text: string,
  brand?: string,
): {text: string; replaced: boolean; reason?: string} {
  const parts = sentencesOf(text);
  if (!parts.length) return {text, replaced: false};
  const kazka = isKazkaCatalogBrand(brand);
  const next: string[] = [];
  let replaced = false;
  let shippingOnce = false;
  let assortmentOnce = false;
  let hardnessOnce = false;

  for (const sentence of parts) {
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
    if (kazka && (EPIR_500.test(sentence) || EPIR_15.test(sentence) || KAZKA_RETURN_14.test(sentence))) {
      replaced = true;
      if (!shippingOnce) {
        next.push(KAZKA_SHIPPING_FACT);
        shippingOnce = true;
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
