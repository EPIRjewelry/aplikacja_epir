import type {GemmaSlots} from './types';

const THANKS_OCCASION = 'podziękowanie';

export function isThanksOccasionMarker(value: string | null | undefined): boolean {
  return value?.trim().toLowerCase() === THANKS_OCCASION;
}

/** Znacznik intencji A — nie utrwalać w sesji ani w tekście UCP. */
export function isCustomOrderProductType(value: string | null | undefined): boolean {
  const pt = value?.trim().toLowerCase() ?? '';
  if (!pt) return false;
  return (
    pt.includes('zamówienie indywidualne') ||
    pt.includes('odcisk') ||
    pt === 'indywidualne' ||
    pt.includes('indywidualne')
  );
}

/** Sloty produktowe z intencji A (bez znaczników podziękowanie / zamówienie indywidualne). */
export function intentHasSearchableProductSlots(slots: GemmaSlots): boolean {
  if (slots.product_type?.trim() && !isCustomOrderProductType(slots.product_type)) {
    return true;
  }
  if (slots.metal?.trim()) return true;
  if (slots.stone?.trim()) return true;
  if (slots.recipient?.trim()) return true;
  const occ = slots.occasion?.trim();
  if (occ && !isThanksOccasionMarker(occ)) return true;
  return false;
}

export function shouldPersistSlotInSession(key: keyof GemmaSlots, value: string): boolean {
  const v = value.trim();
  if (!v) return false;
  if (key === 'occasion' && isThanksOccasionMarker(v)) return false;
  if (key === 'product_type' && isCustomOrderProductType(v)) return false;
  return true;
}

export function catalogTextFromSlots(slots: GemmaSlots): string {
  const productType = slots.product_type?.trim();
  const productTypePart =
    productType && !isCustomOrderProductType(productType) ? productType : '';
  const occasion = slots.occasion?.trim();
  const occasionPart = occasion && !isThanksOccasionMarker(occasion) ? occasion : '';
  const parts = [productTypePart, occasionPart, slots.recipient, slots.metal, slots.stone]
    .map((s) => s?.trim())
    .filter(Boolean);
  return parts.join(' ').trim();
}
