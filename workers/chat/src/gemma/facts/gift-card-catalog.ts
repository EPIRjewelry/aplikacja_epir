import type {ProductMatch} from '../../facts/types';
import type {GemmaSlots} from '../state/types';

/** Klient prosi o kartę podarunkową — wtedy nie filtrujemy po Product.giftCard. */
export function customerRequestsGiftCard(slots: GemmaSlots, userCorpus: string): boolean {
  const blob = [slots.product_type, slots.occasion, slots.recipient, userCorpus]
    .filter(Boolean)
    .join(' ')
    .toLowerCase();
  return /\bkart[aeęy]\s+podarunkow|\bgift\s*card\b/i.test(blob);
}

export function filterOutGiftCardMatches(matches: ProductMatch[]): ProductMatch[] {
  return matches.filter((m) => !m.product.giftCard);
}
