/**
 * Typy dla warstwy pamięci klienta (typed facts + events + raw turns).
 * Granica KB clamp: `MemoryFact` nie reprezentuje treści polityki — policy-touch
 * to wyłącznie `MemoryEvent` (audit-ref).
 *
 * @see docs/EPIR_KB_MCP_POLICY_CONTRACT.md
 * @see docs/EPIR_MEMORY_ARCHITECTURE.md
 */

export const FACT_SLOTS = [
  'budget',
  'metal',
  'stone',
  'ring_size',
  'style',
  'intent',
  'event',
  'product_interest',
  'contact_pref',
  'language',
] as const;

export type FactSlot = (typeof FACT_SLOTS)[number];

export type MemoryFact = {
  id: string;
  shopifyCustomerId: string;
  slot: FactSlot;
  value: string;
  valueRaw?: string | null;
  confidence: number;
  sourceSessionId?: string | null;
  sourceMessageId?: string | null;
  sourceKind: 'extractor' | 'legacy_summary' | 'manual' | 'backfill';
  createdAt: number;
  expiresAt?: number | null;
  supersededBy?: string | null;
};

export const EVENT_KINDS = ['policy_touch', 'product_touch', 'cart_touch', 'faq_touch'] as const;
export type MemoryEventKind = (typeof EVENT_KINDS)[number];

export type MemoryEvent = {
  id: string;
  shopifyCustomerId: string;
  kind: MemoryEventKind;
  refId: string;
  refVersion?: string | null;
  contentHash?: string | null;
  locale?: string | null;
  market?: string | null;
  sessionId?: string | null;
  toolCallId?: string | null;
  calledAt: number;
  meta?: Record<string, unknown> | null;
};

export type MemoryRawTurn = {
  id: string;
  shopifyCustomerId: string;
  sessionId: string;
  messageId?: string | null;
  role: 'user';
  text: string;
  textMasked: boolean;
  createdAt: number;
  expiresAt: number;
};

/** Wejście do klasyfikatora — pojedynczy fragment rozmowy. */
export type ClassifierInput = {
  role: 'user' | 'assistant' | 'tool';
  content: string;
  toolCalls?: Array<{ id: string; name: string; arguments?: string }>;
  toolCallId?: string;
  toolName?: string;
};

/** Wynik klasyfikacji — albo customer-fact, albo audit-ref, albo ignore. */
export type ClassifierVerdict =
  | { kind: 'customer_fact_candidate'; text: string }
  | { kind: 'raw_user_turn'; text: string }
  | { kind: 'policy_touch'; refId?: string; refVersion?: string; toolCallId?: string }
  | { kind: 'product_touch'; refId?: string; toolCallId?: string }
  | { kind: 'cart_touch'; refId?: string; toolCallId?: string }
  | { kind: 'ignore'; reason: string };

/** TTL w ms per slot — patrz docs/EPIR_MEMORY_ARCHITECTURE.md. */
export const FACT_SLOT_TTL_MS: Record<FactSlot, number | null> = {
  budget: 90 * 24 * 3600 * 1000,
  metal: 365 * 24 * 3600 * 1000,
  stone: 365 * 24 * 3600 * 1000,
  ring_size: null,
  style: 365 * 24 * 3600 * 1000,
  intent: 30 * 24 * 3600 * 1000,
  event: 180 * 24 * 3600 * 1000,
  product_interest: 90 * 24 * 3600 * 1000,
  contact_pref: 365 * 24 * 3600 * 1000,
  language: null,
};

export const RAW_TURN_TTL_MS = 180 * 24 * 3600 * 1000;
