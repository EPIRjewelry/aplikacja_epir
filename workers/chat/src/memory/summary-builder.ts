/**
 * Deterministyczny builder `person_memory.summary` z typed facts.
 *
 * Zasada: szablon → zawsze dostajemy niezerowy skrót, gdy są fakty.
 * LLM-merge staje się opcjonalny (patrz `enrichSummaryStyleWithLLM`) i nigdy
 * nie blokuje produkcji użytkownika — rozwiązuje problem "pusta generacja Kimi"
 * z logów 18.04.2026.
 *
 * Pole `source` (`deterministic` | `llm_enriched` | `fallback`) jest logowane
 * metryką `chat.memory.summary_build`.
 */

import type { MemoryFact, FactSlot } from './types';

const SLOT_LABELS: Record<FactSlot, string> = {
  budget: 'budżet',
  metal: 'ulubione metale',
  stone: 'ulubione kamienie',
  ring_size: 'rozmiar pierścionka',
  style: 'styl',
  intent: 'intencja',
  event: 'okazja',
  product_interest: 'zainteresowania',
  contact_pref: 'preferowany kontakt',
  language: 'język',
};

const SUMMARY_MAX_CHARS = 700;

/** Grupuje fakty per slot, bierze najświeższy (najwyższa confidence przy remisach). */
function pickActiveFacts(facts: MemoryFact[]): Record<FactSlot, MemoryFact[]> {
  const byslot: Record<string, MemoryFact[]> = {};
  for (const f of facts) {
    if (f.supersededBy) continue;
    (byslot[f.slot] ||= []).push(f);
  }
  for (const slot of Object.keys(byslot)) {
    byslot[slot].sort((a, b) => {
      if (b.confidence !== a.confidence) return b.confidence - a.confidence;
      return b.createdAt - a.createdAt;
    });
  }
  return byslot as Record<FactSlot, MemoryFact[]>;
}

function formatSlotValues(slot: FactSlot, values: MemoryFact[]): string {
  const unique = Array.from(new Set(values.map((v) => v.value.replace(/_/g, ' '))));
  const take = unique.slice(0, slot === 'product_interest' ? 5 : 3);
  return take.join(', ');
}

/**
 * Buduje zwięzły, polski akapit skrótu z faktów.
 * Zwraca pustą string gdy brak faktów — prompt assembler musi to obsłużyć
 * jako "brak potwierdzonych preferencji".
 */
export function buildDeterministicSummary(facts: MemoryFact[]): string {
  if (!facts.length) return '';
  const grouped = pickActiveFacts(facts);

  const parts: string[] = [];
  if (grouped.budget?.length) {
    const vals = grouped.budget.map((f) => `${f.value} zł`);
    parts.push(`budżet: ${vals.slice(0, 2).join(' / ')}`);
  }
  if (grouped.metal?.length) {
    parts.push(`${SLOT_LABELS.metal}: ${formatSlotValues('metal', grouped.metal)}`);
  }
  if (grouped.stone?.length) {
    parts.push(`${SLOT_LABELS.stone}: ${formatSlotValues('stone', grouped.stone)}`);
  }
  if (grouped.ring_size?.length) {
    parts.push(`rozmiar: ${grouped.ring_size[0].value}`);
  }
  if (grouped.style?.length) {
    parts.push(`styl: ${formatSlotValues('style', grouped.style)}`);
  }
  if (grouped.intent?.length) {
    parts.push(`kontekst: ${formatSlotValues('intent', grouped.intent)}`);
  }
  if (grouped.event?.length) {
    parts.push(`okazja: ${formatSlotValues('event', grouped.event)}`);
  }
  if (grouped.product_interest?.length) {
    parts.push(`${SLOT_LABELS.product_interest}: ${formatSlotValues('product_interest', grouped.product_interest)}`);
  }
  if (grouped.contact_pref?.length) {
    parts.push(`${SLOT_LABELS.contact_pref}: ${grouped.contact_pref[0].value}`);
  }

  if (!parts.length) return '';
  const prefix = 'Preferencje zapamiętane: ';
  const body = parts.join('; ') + '.';
  const combined = (prefix + body).replace(/\s+/g, ' ').trim();
  return combined.length > SUMMARY_MAX_CHARS ? combined.slice(0, SUMMARY_MAX_CHARS - 1) + '…' : combined;
}

/** Etykieta 'no-facts' do prompt assemblera (gdy brak preferencji). */
export const NO_FACTS_SUMMARY_MARKER = '__no_confirmed_preferences__';
