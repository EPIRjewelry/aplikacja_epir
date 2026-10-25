import {extractFactsDeterministic} from '../memory/extractor';

export type BuyerDiscoverSlots = {
  product_type?: string;
  occasion?: string;
  recipient?: string;
  budget?: string;
  metal?: string;
  stone?: string;
};

const RECIPIENT_RE =
  /\b(?:dla|komu)\s+(?:mojej|mojego|mojej\s+)?(żony|męża|mamy|taty|partnerki|partnera|przyjaciółki|przyjaciela|nauczycielki|nauczyciela|siostry|brata|dziewczyny|chłopaka)\b/iu;

const PREZENT_OCCASION_RE = /\b(?:prezent|na\s+urodziny|na\s+rocznicę|na\s+rocznice)\b/iu;

const PRODUCT_TYPE_RE: Array<{pattern: RegExp; value: string}> = [
  {pattern: /\bpierścionek\b/iu, value: 'pierścionek'},
  {pattern: /\bpierscionek\b/iu, value: 'pierścionek'},
  {pattern: /\bnaszyjnik\b/iu, value: 'naszyjnik'},
  {pattern: /\bkolczyk/iu, value: 'kolczyki'},
  {pattern: /\bbransolet/iu, value: 'bransoletka'},
];

const QUALITATIVE_BUDGET_RE =
  /\b(tanio|taniej|skromnie|niedrogo|budżet|do\s+\d|poniżej|powyżej|\d+\s*zł|\d{3,})\b/iu;

function mergeSlot(
  slots: BuyerDiscoverSlots,
  key: keyof BuyerDiscoverSlots,
  value: string,
): void {
  const v = value.trim();
  if (!v) return;
  if (!slots[key]) slots[key] = v;
}

/** Profil discover z korpusu sesji (regex + extractFactsDeterministic). */
export function extractDiscoverSlots(userTexts: string[]): BuyerDiscoverSlots {
  const slots: BuyerDiscoverSlots = {};
  const corpus = userTexts.map((t) => String(t ?? '').trim()).filter(Boolean).join('\n');

  for (const text of userTexts) {
    const t = String(text ?? '').trim();
    if (!t) continue;
    const rec = t.match(RECIPIENT_RE);
    if (rec) mergeSlot(slots, 'recipient', rec[1] ?? rec[0]);
    if (PREZENT_OCCASION_RE.test(t)) mergeSlot(slots, 'occasion', 'gift');
    for (const {pattern, value} of PRODUCT_TYPE_RE) {
      if (pattern.test(t)) mergeSlot(slots, 'product_type', value);
    }
    if (QUALITATIVE_BUDGET_RE.test(t)) {
      const budgetMatch = t.match(/(?:^|\s)(\d{2,5})\s*(?:zł|zl|pln)\b/iu);
      mergeSlot(slots, 'budget', budgetMatch ? budgetMatch[1] : t.slice(0, 80));
    }
  }

  const facts = extractFactsDeterministic(userTexts);
  for (const f of facts) {
    if (f.slot === 'metal') mergeSlot(slots, 'metal', f.value);
    if (f.slot === 'stone') mergeSlot(slots, 'stone', f.value);
    if (f.slot === 'budget') mergeSlot(slots, 'budget', f.value);
    if (f.slot === 'product_interest') mergeSlot(slots, 'product_type', f.value);
    if (f.slot === 'intent' && f.value === 'gift') mergeSlot(slots, 'occasion', 'gift');
    if (f.slot === 'event') mergeSlot(slots, 'occasion', f.value);
  }

  if (/\bzaręczyn|\bzareczyn|pierścionek\s+zaręczyn/i.test(corpus)) {
    mergeSlot(slots, 'product_type', 'pierścionek zaręczynowy');
  }

  return slots;
}
