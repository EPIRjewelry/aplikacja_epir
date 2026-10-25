import type {GemmaIntent} from '../intent/schema';
import type {
  GemmaConversationState,
  GemmaSessionState,
  GemmaSlots,
} from './types';
import {
  clientRequestsOpenCatalog,
  countProfileSlots,
  hasImmediateCatalogSignal,
  hasQualitativeBudgetSignal,
  isAmbiguousGiftLikeProfile,
  isNonCommitmentUserText,
  MAX_DISCOVER_TURNS,
  pickDiscoverMissingSlot,
  pickEngagementAdvisorySlot,
  profileMeetsSearchMinimum,
  shouldRouteEngagementToDiscover,
} from './discover-policy';

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

/**
 * Sloty dające natychmiastowy sygnał katalogowy (typ + metal/kamień).
 * Sama okazja lub odbiorca NIE wystarczą — discover przed search_catalog.
 */
export function intentHasSearchableProductSlots(slots: GemmaSlots): boolean {
  const pt = slots.product_type?.trim() ?? '';
  if (pt && !isCustomOrderProductType(pt)) return true;
  if (slots.metal?.trim() && slots.stone?.trim()) return true;
  if (hasImmediateCatalogSignal(slots)) return true;
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

/** @deprecated użyj profileMeetsSearchMinimum — zachowane dla starszych importów testów */
export function isNeedKnown(slots: GemmaSlots): boolean {
  return profileMeetsSearchMinimum(slots);
}

export function slotsSufficientForSearch(slots: GemmaSlots): boolean {
  return profileMeetsSearchMinimum(slots) || hasImmediateCatalogSignal(slots);
}

function discoverTurnsSatisfied(prev: GemmaSessionState): boolean {
  const turns = prev.discover_turns ?? 0;
  return turns >= MAX_DISCOVER_TURNS;
}

function canExitDiscoverToCatalog(
  prev: GemmaSessionState,
  mergedSlots: GemmaSlots,
  intent: GemmaIntent,
  userText?: string,
): boolean {
  if (clientRequestsOpenCatalog(intent, userText)) return true;
  if (hasQualitativeBudgetSignal(mergedSlots, userText)) return true;
  if (hasImmediateCatalogSignal(mergedSlots)) return true;
  if (intentHasSearchableProductSlots(mergedSlots) || intentHasSearchableProductSlots(intent.slots)) {
    return true;
  }
  if (!profileMeetsSearchMinimum(mergedSlots)) return false;
  if (isAmbiguousGiftLikeProfile(mergedSlots)) {
    return discoverTurnsSatisfied(prev);
  }
  return profileMeetsSearchMinimum(mergedSlots);
}

export function transitionGemmaState(
  prev: GemmaSessionState,
  intent: GemmaIntent,
  opts?: {userText?: string},
): TransitionResult {
  const userText = opts?.userText;
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

  if (
    intent.policy_query?.trim() &&
    shouldRouteEngagementToDiscover(mergedSlots, intent, userText)
  ) {
    const missingSlot = pickEngagementAdvisorySlot(mergedSlots, intent, userText);
    return {
      nextState: 'potrzeby',
      slots: mergedSlots,
      allowedActions: [],
      missingSlot,
    };
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
    if (isNonCommitmentUserText(userText)) {
      const missingSlot = pickDiscoverMissingSlot(mergedSlots);
      return {
        nextState: 'potrzeby',
        slots: mergedSlots,
        allowedActions: [],
        missingSlot,
      };
    }
    if (canExitDiscoverToCatalog(prev, mergedSlots, intent, userText)) {
      return {
        nextState: 'propozycje',
        slots: mergedSlots,
        allowedActions: ['search_catalog'],
      };
    }
    const missingSlot = pickDiscoverMissingSlot(mergedSlots);
    return {
      nextState: 'potrzeby',
      slots: mergedSlots,
      allowedActions: [],
      missingSlot,
    };
  }

  if (hasQualitativeBudgetSignal(mergedSlots, userText)) {
    return {
      nextState: 'propozycje',
      slots: mergedSlots,
      allowedActions: ['search_catalog'],
    };
  }

  if (
    intentHasSearchableProductSlots(mergedSlots) ||
    intentHasSearchableProductSlots(intent.slots) ||
    hasImmediateCatalogSignal(mergedSlots)
  ) {
    return {
      nextState: 'propozycje',
      slots: mergedSlots,
      allowedActions: ['search_catalog'],
    };
  }

  if (profileMeetsSearchMinimum(mergedSlots) && !isAmbiguousGiftLikeProfile(mergedSlots)) {
    return {
      nextState: 'propozycje',
      slots: mergedSlots,
      allowedActions: ['search_catalog'],
    };
  }

  if (profileMeetsSearchMinimum(mergedSlots) && discoverTurnsSatisfied(prev)) {
    return {
      nextState: 'propozycje',
      slots: mergedSlots,
      allowedActions: ['search_catalog'],
    };
  }

  const intentState = intent.state;
  if (
    intentState === 'powitanie' &&
    prev.state === 'powitanie' &&
    prev.turn === 0 &&
    countProfileSlots(mergedSlots) === 0
  ) {
    return {nextState: 'powitanie', slots: mergedSlots, allowedActions: []};
  }

  const missingSlot = pickDiscoverMissingSlot(mergedSlots);
  return {
    nextState: 'potrzeby',
    slots: mergedSlots,
    allowedActions: [],
    missingSlot,
  };
}
