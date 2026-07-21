/**
 * Wykrywanie intencji „rozmiar pierścionka / tabela rozmiarów" z treści wiadomości
 * (heurystyka — nie jest wstrzykiwana do promptu systemowego).
 *
 * Służy WYŁĄCZNIE do routingu pierwszej tury narzędzi (wymuszenie `get_size_table`).
 */

const SIZE_MARKERS_PL = [
  'tabela rozmiar',
  'tabelę rozmiar',
  'tabele rozmiar',
  'rozmiar pierścion',
  'rozmiar pierscion',
  'jaki rozmiar',
  'jak zmierzyć palec',
  'jak zmierzyc palec',
  'jak mierzyć palec',
  'jak mierzyc palec',
  'średnica mm',
  'srednica mm',
  'obwód palca',
  'obwod palca',
  'przeliczenie rozmiaru',
  'rozmiar us',
  'rozmiar uk',
  'rozmiar pl',
];

const SIZE_MARKERS_EN = [
  'ring size',
  'size chart',
  'sizing chart',
  'finger size',
  'measure my finger',
  'size conversion',
];

/** Krótka wiadomość typu „Rozmiar 17" / „rozmiar 16.5". */
const SHORT_SIZE_MESSAGE =
  /^(?:rozmiar|size)\s*[:\-]?\s*\d{1,2}(?:[.,]\d)?\s*(?:mm)?$/iu;

export function detectSizeTableIntent(userMessage: string): { match: boolean } {
  if (typeof userMessage !== 'string') return { match: false };
  const norm = userMessage.trim().toLowerCase();
  if (!norm) return { match: false };
  if (SHORT_SIZE_MESSAGE.test(norm)) return { match: true };
  for (const m of SIZE_MARKERS_PL) {
    if (norm.includes(m)) return { match: true };
  }
  for (const m of SIZE_MARKERS_EN) {
    if (norm.includes(m)) return { match: true };
  }
  return { match: false };
}
