/**
 * Ekstraktor typed facts z wypowiedzi klienta.
 *
 * Dwuwarstwowy:
 *  1. Deterministyczny regex-first-pass (budget, ring_size, metal, stone, language)
 *     — niezawodny, bez LLM, nigdy nie pada pustką.
 *  2. (Opcjonalnie) LLM-pass dla style/intent/event — best-effort, nie blokuje
 *     pipeline'u przy pustej generacji (rozwiązuje problem z logów 18.04).
 *
 * @see memory/classifier.ts
 * @see memory/types.ts
 */

import type { Env } from '../config/bindings';
import { getGroqResponse, type GroqMessage } from '../ai-client';
import type { FactSlot, MemoryFact } from './types';
import { FACT_SLOT_TTL_MS } from './types';

export type ExtractedFact = {
  slot: FactSlot;
  value: string;
  valueRaw: string;
  confidence: number;
};

const METALS = [
  'srebro',
  'złoto',
  'zloto',
  'złoto białe',
  'zloto biale',
  'złoto różowe',
  'zloto rozowe',
  'platyna',
  'pallad',
  'stal chirurgiczna',
];
const STONES = [
  'diament',
  'brylant',
  'szafir',
  'rubin',
  'szmaragd',
  'akwamaryn',
  'topaz',
  'cyrkonia',
  'perła',
  'perla',
  'bursztyn',
  'onyks',
  'turmalin',
  'ametyst',
  'opal',
];

const STYLE_KEYWORDS: Array<{ pattern: RegExp; value: string }> = [
  { pattern: /\b(klasyczn|vintag|retro)/i, value: 'klasyczny' },
  { pattern: /\b(minimalist|subteln|delikatn)/i, value: 'minimalistyczny' },
  { pattern: /\b(art\s*deco|artdeco)/i, value: 'art_deco' },
  { pattern: /\b(boho|bohem)/i, value: 'boho' },
  { pattern: /\b(glamour|blyszcz|błyszcz)/i, value: 'glamour' },
];

const INTENT_KEYWORDS: Array<{ pattern: RegExp; value: string }> = [
  { pattern: /\b(pierścionek zaręczynow|pierscionek zareczynow)/i, value: 'engagement_ring' },
  { pattern: /\b(obrączk|obraczk)/i, value: 'wedding_band' },
  { pattern: /\b(prezent\s+dla|na urodziny|na rocznic)/i, value: 'gift' },
  { pattern: /\b(zwrot|reklamacj|gwarancj|wysyłk|wysylk)/i, value: 'policy_question' },
  { pattern: /\b(rozmiar|dopasowanie)/i, value: 'sizing_help' },
];

const EVENT_KEYWORDS: Array<{ pattern: RegExp; value: string }> = [
  { pattern: /\b(ślub|slub|wesel)/i, value: 'wedding' },
  { pattern: /\b(zaręczyn|zareczyn)/i, value: 'engagement' },
  { pattern: /\b(urodzin)/i, value: 'birthday' },
  { pattern: /\b(rocznic)/i, value: 'anniversary' },
  { pattern: /\b(walentynk)/i, value: 'valentines' },
];

const LANG_PATTERNS: Array<{ pattern: RegExp; value: string }> = [
  { pattern: /^[A-Za-z0-9\s.,!?'"-]+$/u, value: 'en' },
  { pattern: /[ąćęłńóśźż]/i, value: 'pl' },
];

function dedupePush(out: ExtractedFact[], fact: ExtractedFact): void {
  if (out.some((f) => f.slot === fact.slot && f.value === fact.value)) return;
  out.push(fact);
}

/**
 * Deterministyczny ekstraktor — tylko regex, zero LLM. Służy jako first-pass
 * i fallback, gdy LLM-extractor padnie pustką.
 */
export function extractFactsDeterministic(userTexts: string[]): ExtractedFact[] {
  const out: ExtractedFact[] = [];

  for (const rawText of userTexts) {
    const text = String(rawText ?? '').trim();
    if (!text) continue;

    // budget
    const budgetMatch = text.match(/\b(\d{2,5})\s*(zł|zl|pln)\b/i);
    if (budgetMatch) {
      const amount = Number(budgetMatch[1]);
      if (amount >= 50 && amount <= 200000) {
        dedupePush(out, {
          slot: 'budget',
          value: String(amount),
          valueRaw: budgetMatch[0],
          confidence: 0.9,
        });
      }
    }

    // ring size
    const ringMatch = text.match(/\brozmiar\s+(\d{1,2})\b/i);
    if (ringMatch) {
      const size = Number(ringMatch[1]);
      if (size >= 5 && size <= 30) {
        dedupePush(out, {
          slot: 'ring_size',
          value: String(size),
          valueRaw: ringMatch[0],
          confidence: 0.85,
        });
      }
    }

    // metals
    const textLow = text.toLowerCase();
    for (const metal of METALS) {
      if (textLow.includes(metal)) {
        dedupePush(out, {
          slot: 'metal',
          value: metal.replace(/\s+/g, '_'),
          valueRaw: metal,
          confidence: 0.8,
        });
      }
    }
    // stones
    for (const stone of STONES) {
      if (textLow.includes(stone)) {
        dedupePush(out, {
          slot: 'stone',
          value: stone,
          valueRaw: stone,
          confidence: 0.8,
        });
      }
    }
    // style
    for (const { pattern, value } of STYLE_KEYWORDS) {
      if (pattern.test(text)) {
        dedupePush(out, { slot: 'style', value, valueRaw: text.slice(0, 120), confidence: 0.65 });
      }
    }
    // intent
    for (const { pattern, value } of INTENT_KEYWORDS) {
      if (pattern.test(text)) {
        dedupePush(out, { slot: 'intent', value, valueRaw: text.slice(0, 120), confidence: 0.7 });
      }
    }
    // event
    for (const { pattern, value } of EVENT_KEYWORDS) {
      if (pattern.test(text)) {
        dedupePush(out, { slot: 'event', value, valueRaw: text.slice(0, 120), confidence: 0.7 });
      }
    }
    // language
    for (const { pattern, value } of LANG_PATTERNS) {
      if (pattern.test(text)) {
        dedupePush(out, { slot: 'language', value, valueRaw: text.slice(0, 40), confidence: 0.5 });
        break;
      }
    }
  }

  return out;
}

/**
 * LLM-ekstraktor dla miękkich slotów (style/intent/event) — best-effort.
 * Timeout 3s; przy pustej odpowiedzi / timeout zwraca [] (nie rzuca).
 */
export async function extractFactsLLM(
  env: Env,
  userTexts: string[],
  options?: { timeoutMs?: number },
): Promise<ExtractedFact[]> {
  if (!env.AI?.run) return [];
  if (!userTexts.some((t) => t && t.trim().length > 20)) return [];

  const timeoutMs = Math.max(500, options?.timeoutMs ?? 3000);
  const system: GroqMessage = {
    role: 'system',
    content: `Jesteś ekstraktorem strukturalnych faktów z wypowiedzi klienta sklepu jubilerskiego.
Zwróć WYŁĄCZNIE JSON tablicę obiektów o kształcie {"slot":"style|intent|event|product_interest","value":"<normalized>","confidence":<0..1>}.
Dozwolone wartości:
- slot=style: klasyczny, minimalistyczny, art_deco, boho, glamour
- slot=intent: engagement_ring, wedding_band, gift, policy_question, sizing_help, browsing
- slot=event: wedding, engagement, birthday, anniversary, valentines, other
- slot=product_interest: <free-form, max 40 znaków, po polsku>
Jeżeli nic nie wynika z wypowiedzi — zwróć [].
NIE wymyślaj. NIE cytuj polityk sklepu. NIE zapisuj PII.`,
  };
  const user: GroqMessage = {
    role: 'user',
    content: userTexts
      .filter((t) => t && t.trim().length > 0)
      .slice(-5)
      .map((t, i) => `(${i + 1}) ${t.trim().slice(0, 400)}`)
      .join('\n'),
  };

  let raw: string | null = null;
  try {
    raw = await Promise.race([
      getGroqResponse([system, user], env, { max_tokens: 300 }),
      new Promise<string>((_, reject) =>
        setTimeout(() => reject(new Error('extractor_timeout')), timeoutMs),
      ),
    ]);
  } catch (e) {
    console.warn('[memory.extractor] LLM extractor skipped:', (e as Error).message);
    return [];
  }

  if (!raw) return [];
  const jsonStart = raw.indexOf('[');
  const jsonEnd = raw.lastIndexOf(']');
  if (jsonStart < 0 || jsonEnd <= jsonStart) return [];
  const slice = raw.slice(jsonStart, jsonEnd + 1);
  let parsed: unknown;
  try {
    parsed = JSON.parse(slice);
  } catch {
    return [];
  }
  if (!Array.isArray(parsed)) return [];
  const out: ExtractedFact[] = [];
  for (const item of parsed) {
    if (!item || typeof item !== 'object') continue;
    const rec = item as Record<string, unknown>;
    const slot = typeof rec.slot === 'string' ? rec.slot : '';
    const value = typeof rec.value === 'string' ? rec.value.trim() : '';
    const confidence = typeof rec.confidence === 'number' ? rec.confidence : 0.6;
    if (!value || value.length > 60) continue;
    if (!['style', 'intent', 'event', 'product_interest'].includes(slot)) continue;
    dedupePush(out, {
      slot: slot as FactSlot,
      value,
      valueRaw: value,
      confidence: Math.max(0, Math.min(1, confidence)),
    });
  }
  return out;
}

/**
 * Konwertuje ExtractedFact na MemoryFact gotowy do zapisu w D1.
 * Dokleja id, timestamp, TTL wg FACT_SLOT_TTL_MS.
 */
export function toMemoryFact(
  fact: ExtractedFact,
  ctx: {
    shopifyCustomerId: string;
    sourceSessionId?: string | null;
    sourceMessageId?: string | null;
    sourceKind?: MemoryFact['sourceKind'];
    now?: number;
  },
): MemoryFact {
  const now = ctx.now ?? Date.now();
  const ttl = FACT_SLOT_TTL_MS[fact.slot];
  return {
    id: `fact_${now}_${Math.random().toString(36).slice(2, 10)}`,
    shopifyCustomerId: ctx.shopifyCustomerId,
    slot: fact.slot,
    value: fact.value,
    valueRaw: fact.valueRaw ?? null,
    confidence: fact.confidence,
    sourceSessionId: ctx.sourceSessionId ?? null,
    sourceMessageId: ctx.sourceMessageId ?? null,
    sourceKind: ctx.sourceKind ?? 'extractor',
    createdAt: now,
    expiresAt: ttl == null ? null : now + ttl,
    supersededBy: null,
  };
}
