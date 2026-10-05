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
  'jaki mam rozmiar',
  'dobrać rozmiar',
  'dobrac rozmiar',
  'dobór rozmiaru',
  'dobor rozmiaru',
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

export const SIZE_GUIDANCE_REPLY =
  'Rozmiar dobierasz z obwodu palca albo ze średnicy wewnętrznej pierścionka, który już leży dobrze, i porównujesz ten pomiar z tabelą rozmiarów. Nie podaję przy tym ceny ani opisu produktu.';

const MEASUREMENT = /palc|obw[oó]d|średnic|srednic|\bmm\b|tabel/iu;
const PRODUCT_SPEC_DUMP = /\d[\d\s\u00a0.,]*\s*zł|\bsoliter\b|metale\s+/iu;

/** Pytanie o rozmiar nie może wyjść jako karta PDP (cena, metal, Soliter). */
export function guardSizeQuestionReply(text: string): {text: string; replaced: boolean; reason?: string} {
  if (!PRODUCT_SPEC_DUMP.test(text)) return {text, replaced: false};
  if (MEASUREMENT.test(text) && !/\d[\d\s\u00a0.,]*\s*zł/iu.test(text)) return {text, replaced: false};
  return {text: SIZE_GUIDANCE_REPLY, replaced: true, reason: 'size_not_pdp'};
}

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
