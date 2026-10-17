import type {GemmaConversationState, GemmaSlots} from '../state/types';

export type GemmaSafety = 'ok' | 'refuse';

export type GemmaCartAction = 'add' | 'change' | 'remove' | 'show' | null;

export type GemmaIntent = {
  state: GemmaConversationState | string;
  slots: GemmaSlots;
  product_ref: string | null;
  variant_choice: string | null;
  cart_action: GemmaCartAction;
  cart_consent: boolean | null;
  policy_query: string | null;
  safety: GemmaSafety | string;
};

export type IntentParseError = {kind: 'parse'; message: string};

export const GEMMA_CONVERSATION_STATE_VALUES = [
  'powitanie',
  'potrzeby',
  'propozycje',
  'szczegoly',
  'koszyk',
  'polityki_kontakt',
  'odmowa',
] as const;

const CONVERSATION_STATES = new Set<string>(GEMMA_CONVERSATION_STATE_VALUES);

const SLOT_KEYS = new Set(['budget', 'metal', 'stone', 'product_type', 'occasion', 'recipient']);

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function readNullableString(value: unknown): string | null {
  if (value === null || value === undefined) return null;
  return typeof value === 'string' ? value : null;
}

function readSlots(value: unknown): GemmaSlots | null {
  if (!isRecord(value)) return null;
  const slots: GemmaSlots = {};
  for (const key of Object.keys(value)) {
    if (!SLOT_KEYS.has(key)) return null;
    const v = value[key];
    if (v !== null && v !== undefined && typeof v !== 'string') return null;
    slots[key as keyof GemmaSlots] = readNullableString(v);
  }
  return slots;
}

export function validateGemmaIntent(raw: unknown): GemmaIntent | IntentParseError {
  if (!isRecord(raw)) {
    return {kind: 'parse', message: 'root_not_object'};
  }
  const allowed = new Set([
    'state',
    'slots',
    'product_ref',
    'variant_choice',
    'cart_action',
    'cart_consent',
    'policy_query',
    'safety',
  ]);
  for (const key of Object.keys(raw)) {
    if (!allowed.has(key)) {
      return {kind: 'parse', message: `extra_field:${key}`};
    }
  }

  const state = raw.state;
  if (typeof state !== 'string' || !CONVERSATION_STATES.has(state)) {
    return {kind: 'parse', message: 'invalid_state'};
  }

  const slots = readSlots(raw.slots);
  if (!slots) {
    return {kind: 'parse', message: 'invalid_slots'};
  }

  const product_ref = readNullableString(raw.product_ref);
  const variant_choice = readNullableString(raw.variant_choice);
  const policy_query = readNullableString(raw.policy_query);

  let cart_action: GemmaCartAction = null;
  if (raw.cart_action !== null && raw.cart_action !== undefined) {
    if (
      raw.cart_action !== 'add' &&
      raw.cart_action !== 'change' &&
      raw.cart_action !== 'remove' &&
      raw.cart_action !== 'show'
    ) {
      return {kind: 'parse', message: 'invalid_cart_action'};
    }
    cart_action = raw.cart_action;
  }

  let cart_consent: boolean | null = null;
  if (raw.cart_consent !== null && raw.cart_consent !== undefined) {
    if (typeof raw.cart_consent !== 'boolean') {
      return {kind: 'parse', message: 'invalid_cart_consent'};
    }
    cart_consent = raw.cart_consent;
  }

  const safety = raw.safety;
  if (safety !== 'ok' && safety !== 'refuse') {
    return {kind: 'parse', message: 'invalid_safety'};
  }

  return {
    state,
    slots,
    product_ref,
    variant_choice,
    cart_action,
    cart_consent,
    policy_query,
    safety,
  };
}
