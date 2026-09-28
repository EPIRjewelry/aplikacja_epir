/** Wyciąga krótką frazę o koszcie wysyłki z HTML strony Shopify /pages/wysylka. */
export function extractShippingSnippetFromPageHtml(html: string): string {
  const text = stripHtmlToText(html);
  const normalized = text.replace(/\s+/g, ' ').trim();
  if (!normalized) return 'Wysyłka — szczegóły na stronie sklepu';

  const sentenceMatch = normalized.match(
    /[^.!?]*(?:wysyłk|dostaw|kurier|inpost|paczk)[^.!?]*[.!?]?/i,
  );
  const chunk = (sentenceMatch?.[0] ?? normalized).trim();
  const clipped = chunk.length > 120 ? `${chunk.slice(0, 117)}…` : chunk;
  return clipped.startsWith('Wysyłka') ? clipped : `Wysyłka ${clipped}`;
}

export function shippingPageMatchesLegacyAssumptions(html: string): {
  mentions15: boolean;
  mentions500: boolean;
} {
  const text = stripHtmlToText(html).toLowerCase();
  return {
    mentions15: /15\s*zł|15\s*pln/.test(text),
    mentions500: /500\s*zł|500\s*pln/.test(text),
  };
}

function stripHtmlToText(html: string): string {
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, '')
    .replace(/<style[\s\S]*?<\/style>/gi, '')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/&#(\d+);/g, (_, n) => String.fromCharCode(Number(n)));
}

export function buildPdpServiceSentence(parts: {
  leadPhrase: string;
  shippingSnippet: string;
}): string {
  return `${parts.leadPhrase} · ${parts.shippingSnippet} · Jedna darmowa zmiana rozmiaru`;
}
