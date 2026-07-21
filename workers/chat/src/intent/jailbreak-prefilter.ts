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
  'Nie mogę pomóc w tej prośbie. Chętnie doradzę przy wyborze biżuterii EPIR — napisz np. nazwę produktu albo „dodaj do koszyka pierścionek Gałązki”.';
