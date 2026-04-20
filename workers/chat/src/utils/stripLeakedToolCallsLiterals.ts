/**
 * Kimi czasem powiela przykłady z promptu i wypisuje literalny tekst `tool_calls: [...]`
 * zamiast użyć natywnych tool_calls z Workers AI. To usuwa taki śmieć z treści dla klienta.
 */
export function stripLeakedToolCallsLiterals(text: string): string {
  if (!text || typeof text !== 'string') return '';
  let out = text;
  // Kimi / Workers AI: wycieki sekcji narzędzi jako zwykły tekst (np. <|tool_call_begin|> …)
  out = out.replace(/<\|[^>]+\|>/gi, '');
  // Literały typu "functions.update_cart:0" z kanału narzędziowego
  out = out.replace(/\bfunctions\.[a-z_][a-z0-9_]*\s*:\s*\d+/gi, '');
  for (let guard = 0; guard < 12; guard++) {
    const m = /\btool_calls\s*:/i.exec(out);
    if (!m) break;
    const start = m.index;
    let i = start + m[0].length;
    while (i < out.length && /\s/.test(out[i])) i++;
    if (out[i] !== '[') {
      out = out.slice(0, start) + out.slice(i);
      continue;
    }
    let depth = 0;
    let j = i;
    for (; j < out.length; j++) {
      const c = out[j];
      if (c === '[') depth++;
      else if (c === ']') {
        depth--;
        if (depth === 0) {
          out = out.slice(0, start) + out.slice(j + 1);
          break;
        }
      }
    }
    if (j >= out.length) {
      out = out.slice(0, start).trimEnd();
      break;
    }
  }
  return out.replace(/\n{3,}/g, '\n\n').trim();
}
