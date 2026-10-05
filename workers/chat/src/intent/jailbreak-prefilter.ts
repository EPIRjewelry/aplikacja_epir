/**
 * Prefilter jailbreak / self-harm noise — krótkie odmowy + redirect do zakupów.
 * Nie trafia do promptu; działa przed LLM (jak greeting prefilter).
 */

const JAILBREAK_PATTERNS: RegExp[] = [
  /\bzniszcz\s+siebie\b/iu,
  /\bignore\s+(all\s+)?(previous|prior|above)\s+instructions?\b/iu,
  /\bzignoruj\s+(wszystkie\s+)?(poprzednie|wcześniejsze|wczesniejsze)\s+instrukcj/iu,
  /\bDAN\b/,
  /\bdeveloper\s+mode\b/iu,
  /\bjailbreak\b/iu,
  /\bpretend\s+you\s+have\s+no\s+restrictions\b/iu,
  /\bodsłoń\s+prompt\b/iu,
  /\bodslon\s+prompt\b/iu,
  /\breveal\s+(your\s+)?system\s+prompt\b/iu,
  /\bhow\s+to\s+kill\s+(my|your)self\b/iu,
  /\bjak\s+si[eę]\s+zabi[cć]\b/iu,
];

export function detectJailbreakOrHarmIntent(userMessage: string): { match: boolean } {
  if (typeof userMessage !== 'string') return { match: false };
  const text = userMessage.trim();
  if (!text) return { match: false };
  for (const re of JAILBREAK_PATTERNS) {
    if (re.test(text)) return { match: true };
  }
  return { match: false };
}

export const JAILBREAK_REDIRECT_REPLY =
  'Nie mogę pomóc w tej prośbie. Chętnie doradzę przy wyborze biżuterii — napisz nazwę produktu albo co dodać do koszyka.';

const ILLEGAL_OR_HARMFUL: RegExp[] = [
  /\bheroin\p{L}*\b/iu,
  /\bkokain\p{L}*\b/iu,
  /\bnarkotyk\p{L}*\b/iu,
  /\bfentanyl\p{L}*\b/iu,
  /\bmetamfetamin\p{L}*\b/iu,
  /\bamfetamin\p{L}*\b/iu,
  /\bmdma\b/iu,
  /\becstasy\b/iu,
  /\blsd\b/iu,
  /\bmarihuan\p{L}*\b/iu,
  /\bkanabinoid\p{L}*\b/iu,
];

/** Narkotyki i podobna prośba: sama odmowa, bez briefu i bez „Zaprojektuj swój model”. */
export function detectIllegalOrHarmfulRequest(userMessage: string): boolean {
  if (typeof userMessage !== 'string') return false;
  const text = userMessage.trim();
  if (!text) return false;
  return ILLEGAL_OR_HARMFUL.some((pattern) => pattern.test(text));
}

export const HARD_REFUSAL_REPLY = 'Nie mogę pomóc w tej prośbie.';

export function replyPivotsToCreativeBrief(text: string): boolean {
  return /zaprojektuj swój model|wspólnie zrealizujmy|własny projekt|#kazka-custom-order/iu.test(text);
}
