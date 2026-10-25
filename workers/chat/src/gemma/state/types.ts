export type GemmaConversationState =
  | 'powitanie'
  | 'potrzeby'
  | 'propozycje'
  | 'szczegoly'
  | 'koszyk'
  | 'polityki_kontakt'
  | 'odmowa';

export type FormOfAddress = 'unknown' | 'pan' | 'pani';

export type GemmaSlots = {
  budget?: string | null;
  metal?: string | null;
  stone?: string | null;
  product_type?: string | null;
  occasion?: string | null;
  recipient?: string | null;
};

export type GemmaShownRef = {
  ref: string;
  productId: string;
  handle: string;
  variantIds: string[];
  url: string;
  title?: string;
};

export type GemmaSelected = {
  productId: string;
  variantId: string | null;
} | null;

export type GemmaSessionState = {
  state: GemmaConversationState;
  slots: GemmaSlots;
  shown: GemmaShownRef[];
  selected: GemmaSelected;
  form_of_address: FormOfAddress;
  turn: number;
  /** Liczba tur discover (stan potrzeby) w bieżącym cyklu doprecyzowania. */
  discover_turns: number;
};

export const DEFAULT_GEMMA_SESSION_STATE: GemmaSessionState = {
  state: 'powitanie',
  slots: {},
  shown: [],
  selected: null,
  form_of_address: 'unknown',
  turn: 0,
  discover_turns: 0,
};

export const GEMMA_STATE_POST_KEYS = new Set([
  'state',
  'slots',
  'shown',
  'selected',
  'form_of_address',
  'turn',
  'discover_turns',
]);

export const GEMMA_STATE_MAX_BYTES = 16_384;
