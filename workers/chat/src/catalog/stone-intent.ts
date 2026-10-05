/**
 * Kamień z wypowiedzi klienta (PL/EN, odmiana).
 * Jeden kamień w zdaniu blokuje podmianę. Dwa kamienie naraz nie wymuszają filtra.
 */

export type StoneIntent = {
  id: string;
  labelPl: string;
  lemmas: readonly string[];
  pattern: RegExp;
};

type StoneDef = {
  id: string;
  labelPl: string;
  lemmas: readonly string[];
  pattern: RegExp;
};

function stone(id: string, labelPl: string, stems: readonly string[], lemmas: readonly string[]): StoneDef {
  const body = stems.map(escapeRegExp).join('|');
  return {
    id,
    labelPl,
    lemmas,
    pattern: new RegExp(`(?<![\\p{L}\\p{N}])(?:${body})\\p{L}*`, 'iu'),
  };
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

const STONES: readonly StoneDef[] = [
  stone('szafir', 'szafir', ['szafir', 'sapphire'], ['szafir', 'sapphire']),
  stone('turmalin', 'turmalin', ['turmalin', 'tourmaline'], ['turmalin', 'tourmaline']),
  stone('tanzanit', 'tanzanit', ['tanzanit', 'tanzanite'], ['tanzanit', 'tanzanite']),
  stone('cytryn', 'cytryn', ['cytryn', 'citrine'], ['cytryn', 'citrine']),
  stone('kwarc', 'kwarc', ['kwarc', 'quartz'], ['kwarc', 'quartz']),
  stone('diament', 'diament', ['diament', 'brylant', 'diamond'], ['diament', 'brylant', 'diamond']),
  stone('rubin', 'rubin', ['rubin', 'ruby'], ['rubin', 'ruby']),
  stone('szmaragd', 'szmaragd', ['szmaragd', 'emerald'], ['szmaragd', 'emerald']),
  stone('topaz', 'topaz', ['topaz'], ['topaz']),
  stone('ametyst', 'ametyst', ['ametyst', 'amethyst'], ['ametyst', 'amethyst']),
  stone('akwamaryn', 'akwamaryn', ['akwamaryn', 'aquamarine'], ['akwamaryn', 'aquamarine']),
  stone('opal', 'opal', ['opal'], ['opal']),
  stone('granat', 'granat', ['granat', 'garnet'], ['granat', 'garnet']),
  stone('onyks', 'onyks', ['onyks', 'onyx'], ['onyks', 'onyx']),
  stone('bursztyn', 'bursztyn', ['bursztyn'], ['bursztyn']),
  stone('perla', 'perła', ['perła', 'perla', 'pearl'], ['perła', 'pearl']),
  stone('morganit', 'morganit', ['morganit', 'morganite'], ['morganit', 'morganite']),
  stone('aleksandryt', 'aleksandryt', ['aleksandryt', 'alexandrite'], ['aleksandryt', 'alexandrite']),
  stone('spinel', 'spinel', ['spinel'], ['spinel']),
  stone('cyrkonia', 'cyrkonia', ['cyrkonia', 'zirconia'], ['cyrkonia', 'zirconia']),
];

export function detectStoneIntent(text: string): StoneIntent | null {
  if (!text.trim()) return null;
  const found: StoneDef[] = [];
  for (const entry of STONES) {
    if (entry.pattern.test(text)) found.push(entry);
  }
  const unique = [...new Map(found.map((entry) => [entry.id, entry])).values()];
  if (unique.length !== 1) return null;
  const match = unique[0]!;
  return {id: match.id, labelPl: match.labelPl, lemmas: match.lemmas, pattern: match.pattern};
}

/** Ostatnia wiadomość z jednym kamieniem wygrywa. Inaczej najnowsza wcześniejsza. */
export function stoneIntentFromConversation(turns: readonly string[]): StoneIntent | null {
  const lines = turns.map((turn) => turn.trim()).filter(Boolean);
  if (!lines.length) return null;
  const latest = detectStoneIntent(lines[lines.length - 1] ?? '');
  if (latest) return latest;
  for (let index = lines.length - 2; index >= 0; index -= 1) {
    const found = detectStoneIntent(lines[index] ?? '');
    if (found) return found;
  }
  return null;
}

const REFUSES_SUBSTITUTE = /tylko\s+(?:ten\s+)?(?:kamień|kamien|szafir|sapphire)|\bnie,?\s*tylko\b/iu;
const ASKS_OTHER_STONE = /inn(?:y|ym|ego|e|ych)\s+kamie|podobn\p{L}*\s+odcie|pokaż\s+inne|pokaz\s+inne|zgadzam\s+si[eę]\s+na\s+inn/iu;
const OFFERED_OTHER_STONE = /inn(?:y|ym|e|ego|ych)\s+kamie|podobn\p{L}*\s+odcie/iu;
const AFFIRMATIVE = /^(tak|ok|okej|dobrze|poproszę|poprosze|dawaj|jasne|pewnie|może być|moze byc)\b/iu;

/**
 * Zgoda na inny kamień jest jawna. „Słucham”, „pokaż kilka” i „ring” jej nie dają.
 * Samo „tak” liczy się dopiero po pytaniu o inny kamień.
 */
export function buyerAllowsStoneSubstitute(latestUser: string, previousAssistant?: string): boolean {
  const text = latestUser.trim();
  if (!text) return false;
  if (REFUSES_SUBSTITUTE.test(text)) return false;
  if (ASKS_OTHER_STONE.test(text)) return true;
  if (previousAssistant && OFFERED_OTHER_STONE.test(previousAssistant) && AFFIRMATIVE.test(text)) return true;
  return false;
}

export function textMentionsStone(text: string, intent: StoneIntent): boolean {
  return intent.pattern.test(text);
}

export function otherStoneMentioned(text: string, intent: StoneIntent): boolean {
  return STONES.some((entry) => entry.id !== intent.id && entry.pattern.test(text));
}

const JEWELRY_TYPE_HINTS: Array<{pattern: RegExp; title: RegExp}> = [
  {
    pattern: /\b(rings?|pier[sś]cion\p{L}*|obr[aą]cz\p{L}*)\b/iu,
    title: /pier[sś]cion|obr[aą]cz|ring/iu,
  },
  {pattern: /\b(necklaces?|naszyjnik\p{L}*)\b/iu, title: /naszyjnik/iu},
  {pattern: /\b(earrings?|kolczyk\p{L}*)\b/iu, title: /kolczyk/iu},
  {pattern: /\b(bracelets?|bransolet\p{L}*)\b/iu, title: /bransolet/iu},
];

/** Gdy klient doprecyzował rodzaj, zostawiamy go. Pusta lista rodzaju wraca do wszystkich trafień kamienia. */
export function preferJewelryType<T extends {title?: unknown; handle?: unknown}>(
  products: readonly T[],
  buyerText: string,
): T[] {
  const hint = JEWELRY_TYPE_HINTS.find((entry) => entry.pattern.test(buyerText));
  if (!hint) return products.slice(0, 4);
  const preferred = products.filter((product) => {
    const haystack = `${typeof product.title === 'string' ? product.title : ''} ${typeof product.handle === 'string' ? product.handle : ''}`;
    return hint.title.test(haystack);
  });
  if (preferred.length > 0) return preferred.slice(0, 4);
  return products.slice(0, 4);
}

export function expandCatalogQuery(current: string, intent: StoneIntent): string {
  const trimmed = current.trim();
  const lower = trimmed.toLocaleLowerCase('pl-PL');
  const present = intent.lemmas.filter((lemma) => lower.includes(lemma.toLocaleLowerCase('pl-PL')));
  if (!trimmed) return intent.lemmas.join(' ');
  if (present.length === 0) return intent.lemmas.join(' ');
  const missing = intent.lemmas.filter((lemma) => !lower.includes(lemma.toLocaleLowerCase('pl-PL')));
  return missing.length ? `${trimmed} ${missing.join(' ')}` : trimmed;
}

export function shopifyStoneQuery(intent: StoneIntent): string {
  return intent.lemmas.join(' OR ');
}
