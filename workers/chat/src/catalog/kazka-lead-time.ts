/**
 * Czas wykonania z karty Kazka: metafield `custom.czas_wykonania` albo tag 3 dni / 10 dni.
 * Bez tych danych frazy nie ma — nie dopisujemy „Wykonanie” znikąd.
 * Tytuł i handle nie są źródłem (to nie jest zdanie na karcie).
 */

const LEAD_TAG_RE = /(?:^|\b)(3|10)[\s_-]*dni(?:owa|owe)?/i;

export function kazkaLeadTimePhrase(input: {
  tags?: readonly string[] | null;
  metafieldValue?: string | null;
}): string | undefined {
  const fromMeta = input.metafieldValue?.trim();
  if (fromMeta) {
    const n = Number.parseInt(fromMeta, 10);
    if (n === 3) return 'Wykonanie 3 dni robocze';
    if (n === 10) return 'Wykonanie 10 dni roboczych';
  }

  const tagHits: Array<3 | 10> = [];
  for (const tag of input.tags ?? []) {
    const match = tag.match(LEAD_TAG_RE);
    if (!match) continue;
    const days = Number(match[1]);
    if (days === 3 || days === 10) tagHits.push(days);
  }
  const unique = [...new Set(tagHits)];
  if (unique.length !== 1) return undefined;
  return unique[0] === 3 ? 'Wykonanie 3 dni robocze' : 'Wykonanie 10 dni roboczych';
}
