/**
 * Odpowiedź, którą znamy z faktów sklepu, zanim model zdąży się wywrócić.
 * Taka tura dostaje jeden tekst. Nie idzie „chwilowo”, skoro fakt już jest.
 */

import {detectPolicyInformationIntent} from '../intent/policy-information';
import {detectSizeTableIntent, SIZE_GUIDANCE_REPLY} from '../intent/size-table';
import {isEpirFamilyCatalogBrand, isKazkaCatalogBrand} from './kazka-assortment';
import {CERTIFICATE_UNKNOWN, isCertificateQuestion} from './stone-origin';
import {EPIR_SHIPPING_FACT, KAZKA_RETURNS_FACT, KAZKA_SHIPPING_FACT} from './store-facts';

export const INCOMPLETE_TURN_REPLY =
  'Przepraszam, chwilowo nie mogę dokończyć odpowiedzi. Napisz proszę jeszcze raz za moment.';

export const EMPTY_TURN_REPLY =
  'Przepraszam, chwilowo nie mogę przygotować pełnej odpowiedzi. Spróbuj proszę ponownie za moment.';

const RETURNS_ASK = /zwrot|reklamac|odst[aą]p/iu;
const SHIPPING_ASK = /wysy[lł]|dostaw/iu;

export function groundedTurnReply(userMessage: string, brand?: string): string | null {
  const parts: string[] = [];
  if (detectSizeTableIntent(userMessage).match) parts.push(SIZE_GUIDANCE_REPLY);
  const policy = detectPolicyInformationIntent(userMessage).match;
  if (policy && isKazkaCatalogBrand(brand)) {
    if (RETURNS_ASK.test(userMessage)) parts.push(KAZKA_RETURNS_FACT);
    if (SHIPPING_ASK.test(userMessage)) parts.push(KAZKA_SHIPPING_FACT);
  } else if (policy && SHIPPING_ASK.test(userMessage) && (isEpirFamilyCatalogBrand(brand) || !brand)) {
    parts.push(EPIR_SHIPPING_FACT);
  }
  if (!parts.length) return null;
  return parts.join(' ');
}

/** Puste albo przerwane domknięcie tury. Fakt sklepu wygrywa z „chwilowo”. */
export function replyOrStall(userMessage: string, brand: string | undefined, kind: 'empty' | 'error'): string {
  if (isCertificateQuestion(userMessage)) return CERTIFICATE_UNKNOWN;
  return groundedTurnReply(userMessage, brand) ?? (kind === 'empty' ? EMPTY_TURN_REPLY : INCOMPLETE_TURN_REPLY);
}
