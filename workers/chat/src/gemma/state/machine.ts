import type {GemmaIntent} from '../intent/schema';
import type {
  GemmaConversationState,
  GemmaSessionState,
  GemmaSlots,
} from './types';

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
  const parts = [slots.product_type, slots.occasion, slots.recipient, slots.metal, slots.stone]
    .map((s) => s?.trim())
    .filter(Boolean);
  return parts.join(' ').trim();
}

export type GemmaAllowedAction = 'search_catalog' | 'get_product' | 'cart' | 'kb_policies';

export type TransitionResult = {
  nextState: GemmaConversationState;
  slots: GemmaSlots;
  allowedActions: GemmaAllowedAction[];
  missingSlot?: keyof GemmaSlots;
};

/** Intencja A: zamówienie indywidualne / odcisk — bez wyszukiwania katalogu (link w szablonie). */
export function intentRequestsCustomOrder(intent: GemmaIntent): boolean {
  return isCustomOrderProductType(intent.slots.product_type);
}

export function isThanksAckIntent(intent: GemmaIntent): boolean {
  return (
    isThanksOccasionMarker(intent.slots.occasion) &&
    !intentHasSearchableProductSlots(intent.slots)
  );
}

function mergeSlots(prev: GemmaSlots, incoming: GemmaSlots): GemmaSlots {
  const out: GemmaSlots = {...prev};
  for (const key of Object.keys(incoming) as (keyof GemmaSlots)[]) {
    const v = incoming[key];
    if (v !== null && v !== undefined && String(v).trim()) {
      const trimmed = String(v).trim();
      if (!shouldPersistSlotInSession(key, trimmed)) continue;
      out[key] = trimmed;
    }
  }
  return out;
}

export function isNeedKnown(slots: GemmaSlots): boolean {
  return Boolean(
    slots.product_type?.trim() ||
      slots.occasion?.trim() ||
      slots.recipient?.trim(),
  );
}

function hasQualitativeBudget(slots: GemmaSlots): boolean {
  const b = slots.budget?.trim().toLowerCase() ?? '';
  return b.length > 0;
}

export function slotsSufficientForSearch(slots: GemmaSlots): boolean {
  return isNeedKnown(slots) || hasQualitativeBudget(slots);
}

function pickMissingSlot(slots: GemmaSlots): keyof GemmaSlots {
  if (!slots.product_type?.trim() && !slots.occasion?.trim() && !slots.recipient?.trim()) {
    return 'product_type';
  }
  if (!slots.budget?.trim()) return 'budget';
  return 'metal';
}

export function transitionGemmaState(
  prev: GemmaSessionState,
  intent: GemmaIntent,
): TransitionResult {
  const mergedSlots = mergeSlots(prev.slots, intent.slots);

  if (intent.safety !== 'ok') {
    return {nextState: 'odmowa', slots: mergedSlots, allowedActions: []};
  }

  if (isThanksAckIntent(intent) && !intent.cart_action && !intent.policy_query?.trim()) {
    return {nextState: 'powitanie', slots: mergedSlots, allowedActions: []};
  }

  if (intentRequestsCustomOrder(intent) && !intent.cart_action && !intent.policy_query?.trim()) {
    return {nextState: 'propozycje', slots: mergedSlots, allowedActions: []};
  }

  if (intent.policy_query?.trim()) {
    return {
      nextState: 'polityki_kontakt',
      slots: mergedSlots,
      allowedActions: ['kb_policies'],
    };
  }

  const cartShowIsProductBrowse =
    intent.cart_action === 'show' &&
    (intentHasSearchableProductSlots(intent.slots) || Boolean(intent.product_ref?.trim()));

  if (cartShowIsProductBrowse) {
    return {
      nextState: 'propozycje',
      slots: mergedSlots,
      allowedActions: ['search_catalog'],
    };
  }

  if (intent.cart_action) {
    return {
      nextState: 'koszyk',
      slots: mergedSlots,
      allowedActions: ['cart'],
    };
  }

  if (intent.product_ref?.trim()) {
    return {
      nextState: 'szczegoly',
      slots: mergedSlots,
      allowedActions: ['get_product'],
    };
  }

  if (prev.state === 'potrzeby') {
    return {
      nextState: 'propozycje',
      slots: mergedSlots,
      allowedActions: ['search_catalog'],
    };
  }

  if (
    isNeedKnown(mergedSlots) ||
    intentHasSearchableProductSlots(mergedSlots) ||
    intentHasSearchableProductSlots(intent.slots)
  ) {
    return {
      nextState: 'propozycje',
      slots: mergedSlots,
      allowedActions: ['search_catalog'],
    };
  }

  if (slotsSufficientForSearch(mergedSlots)) {
    return {
      nextState: 'propozycje',
      slots: mergedSlots,
      allowedActions: ['search_catalog'],
    };
  }

  const intentState = intent.state;
  if (intentState === 'powitanie' && prev.state === 'powitanie' && prev.turn === 0) {
    return {nextState: 'powitanie', slots: mergedSlots, allowedActions: []};
  }

  const missingSlot = pickMissingSlot(mergedSlots);
  return {
    nextState: 'potrzeby',
    slots: mergedSlots,
    allowedActions: [],
    missingSlot,
  };
}
