/**
 * Kamień z wypowiedzi klienta (PL/EN, odmiana).
 * Jeden kamień w zdaniu blokuje podmianę. Dwa kamienie naraz nie wymuszają filtra.
 */

import {detectPolicyInformationIntent} from '../intent/policy-information';

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

const METAL_OR_TOPIC_SHIFT =
  /\b(925|585|750|999|pr[oó]b\p{L}*|srebr\p{L}*|z[łl]ot\p{L}*|platyn\p{L}*)\b/iu;

const PURITY_SHIFT = /\b(925|585|750|999|pr[oó]b)/iu;

/** Sam metal jako odpowiedź na odkrywanie. „925 czy 585” i zdanie z dwoma metalami zostają zmianą próby. */
const METAL_ONLY_ANSWER =
  /^(?:a\s+)?(?:może\s+|moze\s+)?(?:poprosz[eę]\s+)?(?:tylko\s+)?(?:w\s+)?(?:ze?\s+|z\s+)?(srebr\p{L}*|z[łl]ot\p{L}*|platyn\p{L}*|silver|gold|platinum)[.!?…\s]*$/iu;

const CLASSIC_STYLE = /klasyczn\p{L}*/iu;
const RING_ASK =
  /\b(rings?|pier[sś]cion\p{L}*|pier[sś]conk\p{L}*|piersconk\p{L}*|obr[aą]cz\p{L}*|zar[eę]czyn\p{L}*|soliter\p{L}*|solitaire)\b/iu;

export type DiscoveryMetal = 'srebro' | 'złoto' | 'platyna';

export type DiscoveryMetalBrowse = {
  metal: DiscoveryMetal;
  query: string;
};

function discoveryMetalFromWord(word: string): DiscoveryMetal | null {
  const folded = word.toLocaleLowerCase('pl-PL');
  if (folded.startsWith('srebr') || folded === 'silver') return 'srebro';
  if (/^z[łl]ot/.test(folded) || folded === 'gold') return 'złoto';
  if (folded.startsWith('platyn') || folded === 'platinum') return 'platyna';
  return null;
}

/** Krótka odpowiedź metalem, bez próby i bez kamienia w tym samym zdaniu. */
export function metalPreferenceFromTurn(text: string): DiscoveryMetal | null {
  const latest = text.trim();
  if (!latest || detectStoneIntent(latest) || detectPolicyInformationIntent(latest).match) return null;
  if (PURITY_SHIFT.test(latest)) return null;
  const match = latest.match(METAL_ONLY_ANSWER);
  if (!match?.[1]) return null;
  return discoveryMetalFromWord(match[1]);
}

function priorAsksClassicRing(prior: readonly string[]): boolean {
  const joined = prior.join('\n');
  return CLASSIC_STYLE.test(joined) && RING_ASK.test(joined);
}

/**
 * Odkrywanie klasycznego pierścionka, a potem sam metal.
 * „srebro” / „złoto” zostaje filtrem katalogu, nie zamknięciem listy.
 * Wcześniejszy kamień albo pytanie o próbę idą starą ścieżką.
 */
export function discoveryMetalBrowse(turns: readonly string[]): DiscoveryMetalBrowse | null {
  const lines = turns.map((turn) => turn.trim()).filter(Boolean);
  if (lines.length < 2) return null;
  const latest = lines[lines.length - 1] ?? '';
  const metal = metalPreferenceFromTurn(latest);
  if (!metal) return null;
  const prior = lines.slice(0, -1);
  if (prior.some((line) => detectStoneIntent(line))) return null;
  if (!priorAsksClassicRing(prior)) return null;
  return {metal, query: `pierścionek klasyczny ${metal}`};
}

export function rewriteCatalogQueryForDiscoveryMetal(query: string, turns: readonly string[]): string {
  const browse = discoveryMetalBrowse(turns);
  if (!browse) return query;
  const trimmed = query.trim();
  if (!trimmed) return browse.query;
  const hasRing = RING_ASK.test(trimmed) || /pier[sś]conk|piersconk|obr[aą]cz/iu.test(trimmed);
  const hasMetal = trimmed.toLocaleLowerCase('pl-PL').includes(browse.metal);
  if (hasRing && hasMetal) return trimmed;
  if (hasRing) return `${trimmed} ${browse.metal}`;
  return browse.query;
}

/**
 * Nowa próba albo metal w ostatniej turze zamyka poprzednią listę SKU.
 * „Pokaż kilka” i doprecyzowanie ceny jej nie zamykają.
 * Jawny kamień w tym samym zdaniu zostaje.
 * Sam metal po klasycznym pierścionku nie zamyka odkrywania.
 */
export function latestTurnClearsProductContext(text: string, priorTurns: readonly string[] = []): boolean {
  const latest = text.trim();
  if (!latest) return false;
  if (detectStoneIntent(latest)) return false;
  if (detectPolicyInformationIntent(latest).match) return false;
  if (discoveryMetalBrowse([...priorTurns, latest])) return false;
  return METAL_OR_TOPIC_SHIFT.test(latest);
}

/** Ostatnia wiadomość z jednym kamieniem wygrywa. Inaczej najnowsza wcześniejsza. */
export function stoneIntentFromConversation(turns: readonly string[]): StoneIntent | null {
  const lines = turns.map((turn) => turn.trim()).filter(Boolean);
  if (!lines.length) return null;
  const latestLine = lines[lines.length - 1] ?? '';
  if (latestTurnClearsProductContext(latestLine, lines.slice(0, -1))) return null;
  if (detectPolicyInformationIntent(latestLine).match) return null;
  const latest = detectStoneIntent(latestLine);
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

const RING_PRODUCT = /pier[sś]cion|obr[aą]cz|\bring\b|soliter|solitaire/iu;
const NECKLACE_PRODUCT = /naszyjnik|necklace/iu;

const JEWELRY_TYPE_HINTS: Array<{id: string; pattern: RegExp; title: RegExp}> = [
  {id: 'ring', pattern: RING_ASK, title: RING_PRODUCT},
  {pattern: /\b(necklaces?|naszyjnik\p{L}*)\b/iu, title: /naszyjnik/iu, id: 'necklace'},
  {pattern: /\b(earrings?|kolczyk\p{L}*)\b/iu, title: /kolczyk/iu, id: 'earring'},
  {pattern: /\b(bracelets?|bransolet\p{L}*)\b/iu, title: /bransolet/iu, id: 'bracelet'},
];

export function buyerAsksForRing(text: string): boolean {
  return RING_ASK.test(text);
}

/** Naszyjnik Iluzja nie jest pierścionkiem, nawet gdy w opisie jest brylant. */
export function productLooksLikeRing(product: {title?: unknown; handle?: unknown}): boolean {
  const title = typeof product.title === 'string' ? product.title : '';
  const handle = typeof product.handle === 'string' ? product.handle : '';
  const haystack = `${title} ${handle}`;
  if (NECKLACE_PRODUCT.test(haystack)) return false;
  if (/\biluzja\b/iu.test(haystack) && !RING_PRODUCT.test(haystack)) return false;
  return RING_PRODUCT.test(haystack);
}

function pushText(into: string[], value: unknown): void {
  if (typeof value === 'string' && value.trim()) into.push(value);
  if (!Array.isArray(value)) return;
  for (const item of value) {
    if (typeof item === 'string' && item.trim()) into.push(item);
  }
}

/** Metal z karty: tytuł, uchwyt, opis, tagi, metals albo opcja Metal. */
export function productMatchesDiscoveryMetal(
  product: {
    title?: unknown;
    handle?: unknown;
    description?: unknown;
    tags?: unknown;
    metals?: unknown;
    options?: unknown;
  },
  metal: DiscoveryMetal,
): boolean {
  const chunks: string[] = [];
  pushText(chunks, product.title);
  pushText(chunks, product.handle);
  pushText(chunks, product.description);
  pushText(chunks, product.tags);
  pushText(chunks, product.metals);
  if (Array.isArray(product.options)) {
    for (const option of product.options) {
      if (!option || typeof option !== 'object') continue;
      pushText(chunks, (option as {values?: unknown}).values);
    }
  }
  const haystack = chunks.join('\n');
  if (metal === 'srebro') return /srebr|silver/iu.test(haystack);
  if (metal === 'złoto') return /z[łl]ot|\bgold\b/iu.test(haystack);
  return /platyn|\bplatinum\b/iu.test(haystack);
}

/**
 * Gdy klient doprecyzował rodzaj, zostawiamy go.
 * Brak pierścionka nie wraca do naszyjnika (Iluzja).
 * Bez rodzaju zostają pierwsze trafienia kamienia.
 */
export function preferJewelryType<T extends {title?: unknown; handle?: unknown}>(
  products: readonly T[],
  buyerText: string,
): T[] {
  const hint = JEWELRY_TYPE_HINTS.find((entry) => entry.pattern.test(buyerText));
  if (!hint) return products.slice(0, 4);
  const preferred = products.filter((product) => {
    if (hint.id === 'ring') return productLooksLikeRing(product);
    const haystack = `${typeof product.title === 'string' ? product.title : ''} ${typeof product.handle === 'string' ? product.handle : ''}`;
    return hint.title.test(haystack);
  });
  if (preferred.length > 0) return preferred.slice(0, 4);
  return [];
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

/** Soliter / zaręczyny, gdy w zdaniu nie ma jednego kamienia. Kamień idzie osobną ścieżką. */
export function detectNamedBrowseQuery(text: string): string | null {
  if (detectStoneIntent(text)) return null;
  if (/soliter|solitaire/iu.test(text)) return 'soliter';
  if (/zar[eę]czyn/iu.test(text)) return 'pierścionek zaręczynowy';
  return null;
}

export function ringRetryQuery(base: string): string {
  const trimmed = base.trim();
  return `${trimmed} pierścionek obrączka soliter -naszyjnik -iluzja`;
}

export function namedBrowseFromConversation(turns: readonly string[]): string | null {
  const lines = turns.map((turn) => turn.trim()).filter(Boolean);
  if (!lines.length) return null;
  const latest = lines[lines.length - 1] ?? '';
  if (detectPolicyInformationIntent(latest).match) return null;
  if (latestTurnClearsProductContext(latest, lines.slice(0, -1))) return null;
  for (let index = lines.length - 1; index >= 0; index -= 1) {
    if (detectStoneIntent(lines[index] ?? '')) return null;
    const query = detectNamedBrowseQuery(lines[index] ?? '');
    if (query) return query;
  }
  return null;
}
