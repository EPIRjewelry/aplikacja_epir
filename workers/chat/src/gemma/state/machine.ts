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

/** Cena / kamień w kontekście metalu lub katalogu → search_catalog, nie KB policy_query. */
export function intentPolicyQueryShouldUseCatalog(
  intent: GemmaIntent,
  mergedSlots: GemmaSlots,
): boolean {
  const q = intent.policy_query?.trim();
  if (!q) return false;
  const hasCatalogContext =
    Boolean(mergedSlots.metal?.trim() || intent.slots.metal?.trim()) ||
    Boolean(mergedSlots.stone?.trim() || intent.slots.stone?.trim()) ||
    Boolean(mergedSlots.product_type?.trim() || intent.slots.product_type?.trim());
  if (!hasCatalogContext) return false;
  const lower = q.toLowerCase();
  if (/\b(ile\s+kosztuje|jaka\s+(jest\s+)?cena|kosztuje)\b/i.test(lower)) return true;
  if (/\bw\s+585\b/i.test(lower)) return true;
  if (/\b585\b/.test(lower) && /\b(szafir|rubin|diament|kamie[nń])\b/i.test(lower)) return true;
  return false;
}

function mergeSlots(prev: GemmaSlots, incoming: GemmaSlots): GemmaSlots {
  const out: GemmaSlots = {...prev};
  for (const key of Object.keys(incoming) as (keyof GemmaSlots)[]) {
    const v = incoming[key];
    if (key === 'budget') {
      if (v === null) {
        delete out.budget;
        continue;
      }
      if (typeof v === 'number' && Number.isFinite(v) && v > 0) {
        out.budget = v;
      }
      continue;
    }
    if (key === 'budget_qualitative') {
      if (v === null) {
        delete out.budget_qualitative;
        continue;
      }
      if (typeof v === 'string' && v.trim()) {
        out.budget_qualitative = v.trim();
      }
      continue;
    }
    if (v === null || v === undefined) continue;
    if (typeof v === 'string' && v.trim()) {
      const trimmed = v.trim();
      if (!shouldPersistSlotInSession(key, trimmed)) continue;
      if (key === 'metal') out.metal = trimmed;
      else if (key === 'stone') out.stone = trimmed;
      else if (key === 'product_type') out.product_type = trimmed;
      else if (key === 'occasion') out.occasion = trimmed;
      else if (key === 'recipient') out.recipient = trimmed;
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

function budgetSlotPresent(slots: GemmaSlots): boolean {
  if (typeof slots.budget === 'number') return Number.isFinite(slots.budget) && slots.budget > 0;
  return Boolean(slots.budget_qualitative?.trim());
}

function hasQualitativeBudget(slots: GemmaSlots): boolean {
  return Boolean(slots.budget_qualitative?.trim()) && slots.budget == null;
}

export function slotsSufficientForSearch(slots: GemmaSlots): boolean {
  return isNeedKnown(slots) || budgetSlotPresent(slots);
}

function pickMissingSlot(slots: GemmaSlots): keyof GemmaSlots {
  if (!slots.product_type?.trim() && !slots.occasion?.trim() && !slots.recipient?.trim()) {
    return 'product_type';
  }
  if (!budgetSlotPresent(slots)) return 'budget';
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
    if (intentPolicyQueryShouldUseCatalog(intent, mergedSlots)) {
      return {
        nextState: 'propozycje',
        slots: mergedSlots,
        allowedActions: ['search_catalog'],
      };
    }
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
