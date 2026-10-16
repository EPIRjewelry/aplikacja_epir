import type {GemmaIntent} from '../intent/schema';
import type {
  GemmaConversationState,
  GemmaSessionState,
  GemmaSlots,
} from './types';

export type GemmaAllowedAction = 'search_catalog' | 'get_product' | 'cart' | 'kb_policies';

export type TransitionResult = {
  nextState: GemmaConversationState;
  slots: GemmaSlots;
  allowedActions: GemmaAllowedAction[];
  missingSlot?: keyof GemmaSlots;
};

function mergeSlots(prev: GemmaSlots, incoming: GemmaSlots): GemmaSlots {
  const out: GemmaSlots = {...prev};
  for (const key of Object.keys(incoming) as (keyof GemmaSlots)[]) {
    const v = incoming[key];
    if (v !== null && v !== undefined && String(v).trim()) {
      out[key] = String(v).trim();
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

  if (intent.policy_query?.trim()) {
    return {
      nextState: 'polityki_kontakt',
      slots: mergedSlots,
      allowedActions: ['kb_policies'],
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

  if (isNeedKnown(mergedSlots)) {
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
