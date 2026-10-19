import type {BuyerChannelId} from '../../buyer/channel-switch';
import type {GemmaConversationState} from '../state/types';
import {GEMMA_PLACEHOLDER_REF, GEMMA_PLACEHOLDER_REF_PRICE} from '../formulation/constants';
import {templateUsesInformalTy} from '../profiles/epir';
import {GEMMA_REPLY_MAX_CHARS} from './constants';

export type ReplyValidationFacts = {
  allowedRefs: Set<string>;
  allowedNumbers: Set<string>;
  kbAnswer: string | null;
  userText: string;
  channelId: BuyerChannelId;
  conversationState: GemmaConversationState;
};

const URL_IN_TEXT =
  /https?:\/\/|www\.|\[[^\]]*\]\([^)]+\)|[a-z0-9][-a-z0-9]*\.[a-z]{2,}\/[^\s)\]>]+/i;

const ADDRESS_SLASH_PAIR = /(Pan|Pana|Panu|Panem|Pani|Panią)\/(Pan|Pana|Panu|Panem|Pani|Panią)/iu;
const ALLOWED_LUB_ADDRESS = /\b(Pan|Panu|Pana)\s+lub\s+Pani\b/giu;
const STANDALONE_ADDRESS = /(?<!\p{L})(Pan|Pani|Pana|Panu|Panem|Panią)(?!\p{L})/u;
/** Kwota w tekście modelu: ceny wyłącznie przez {{gN.price}} (E5-D7 b2), także gdy liczba jest w userText. */
const CURRENCY_AMOUNT = /\d[\d\s.,]*\s*(?:zł|zl|pln|złotych|złote|złoty)(?!\p{L})/iu;

function hasSlashGenderedAddress(text: string): boolean {
  return ADDRESS_SLASH_PAIR.test(text);
}

function hasStandaloneGenderedAddress(text: string): boolean {
  const withoutAllowed = text.replace(ALLOWED_LUB_ADDRESS, ' ');
  return STANDALONE_ADDRESS.test(withoutAllowed);
}

/** Placeholdery {{gN}} / {{gN.price}} nie są liczbami tekstu (cyfra w refie). */
function stripPlaceholders(text: string): string {
  return text
    .replace(new RegExp(GEMMA_PLACEHOLDER_REF_PRICE.source, 'g'), ' ')
    .replace(new RegExp(GEMMA_PLACEHOLDER_REF.source, 'g'), ' ');
}

function normalizePhoneDigits(text: string): string {
  return text.replace(/[\s\-+]/g, '').replace(/^0048/, '').replace(/^48/, '');
}

function extractPhoneSequences(text: string): string[] {
  const out: string[] = [];
  const re = /(?:\+?48[\s\-]*)?(?:\d[\s\-]*){9,}/g;
  let m;
  while ((m = re.exec(text)) !== null) {
    const digits = normalizePhoneDigits(m[0]);
    if (digits.length >= 9) out.push(digits.slice(-9));
  }
  return out;
}

function joinSeparatedDigits(text: string): string {
  return text.replace(/(\d)[\s.\-]+(?=\d)/g, '$1');
}

function extractNumbers(text: string): string[] {
  const joined = joinSeparatedDigits(text);
  const re = /\d+/g;
  const out: string[] = [];
  let m;
  while ((m = re.exec(joined)) !== null) {
    if (m[0]) out.push(m[0]);
  }
  return out;
}

function collectPlaceholderRefs(text: string): string[] {
  const refs: string[] = [];
  for (const re of [GEMMA_PLACEHOLDER_REF, GEMMA_PLACEHOLDER_REF_PRICE]) {
    const r = new RegExp(re.source, re.flags);
    let m;
    while ((m = r.exec(text)) !== null) {
      if (m[1]) refs.push(m[1]);
    }
  }
  return refs;
}

export function validateFormulationTextBeforeStitch(
  text: string,
  productRefs: string[],
  facts: ReplyValidationFacts,
): string[] {
  const violations: string[] = [];
  const trimmed = text.trim();
  if (!trimmed) violations.push('empty_text');
  if (trimmed.length > GEMMA_REPLY_MAX_CHARS) violations.push('too_long');

  for (const ref of productRefs) {
    if (!facts.allowedRefs.has(ref)) violations.push('ref_out_of_scope');
  }
  for (const ref of collectPlaceholderRefs(trimmed)) {
    if (!facts.allowedRefs.has(ref)) violations.push('ref_out_of_scope');
  }

  if (facts.conversationState === 'propozycje' && facts.allowedRefs.size > 0) {
    const placeholderRefs = collectPlaceholderRefs(trimmed);
    const citesCatalog =
      productRefs.some((r) => facts.allowedRefs.has(r)) ||
      placeholderRefs.some((r) => facts.allowedRefs.has(r));
    if (!citesCatalog) violations.push('catalog_ref_missing');
  }

  if (URL_IN_TEXT.test(trimmed)) violations.push('url_in_model_text');

  const plain = stripPlaceholders(trimmed);
  if (CURRENCY_AMOUNT.test(plain)) violations.push('price_in_model_text');

  const numbersInText = extractNumbers(plain);
  for (const n of numbersInText) {
    if (!facts.allowedNumbers.has(n)) violations.push('number_not_in_facts');
  }

  const kbDigits = facts.kbAnswer
    ? new Set(extractPhoneSequences(facts.kbAnswer).map(normalizePhoneDigits))
    : new Set<string>();
  for (const seq of extractPhoneSequences(plain)) {
    const norm = normalizePhoneDigits(seq);
    if (!kbDigits.has(norm)) violations.push('phone_not_in_facts');
  }

  if (facts.kbAnswer?.trim()) {
    const kbPhones = extractPhoneSequences(facts.kbAnswer);
    const textPhones = extractPhoneSequences(plain);
    const textPhoneSet = new Set(textPhones.map(normalizePhoneDigits));
    const kbNumbers = extractNumbers(facts.kbAnswer).filter((n) => n.length >= 2);
    const textNumbers = new Set(extractNumbers(plain));
    const missingPhone = kbPhones.some((p) => !textPhoneSet.has(normalizePhoneDigits(p)));
    const missingNumber = kbNumbers.some((n) => !textNumbers.has(n));
    if (missingPhone || missingNumber) violations.push('kb_fact_dropped');
  }

  if (templateUsesInformalTy(trimmed)) violations.push('informal_address');
  if (hasSlashGenderedAddress(trimmed)) violations.push('slash_gendered_address');
  else if (hasStandaloneGenderedAddress(trimmed)) violations.push('gendered_address');

  const qCount = (trimmed.match(/\?/g) ?? []).length;
  if (qCount > 1) violations.push('too_many_questions');

  const ch = facts.channelId;
  if ((ch === 'epir-online-store' || ch === 'epir-zareczyny') && /kazka/i.test(trimmed)) {
    violations.push('brand_mix');
  }

  return violations;
}

export function assertStitchedUrlsAllowed(text: string, allowedUrls: Set<string>): boolean {
  const re = /https?:\/\/[^\s)\]>]+/gi;
  let m;
  while ((m = re.exec(text)) !== null) {
    const norm = m[0].replace(/\/$/, '');
    let ok = false;
    for (const allowed of allowedUrls) {
      const a = allowed.replace(/\/$/, '');
      if (norm === a || norm.startsWith(a)) {
        ok = true;
        break;
      }
    }
    if (!ok) return false;
  }
  return true;
}
