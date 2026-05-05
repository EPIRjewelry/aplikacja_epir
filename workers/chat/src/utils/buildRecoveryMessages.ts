import type { GroqMessage } from '../ai-client';

const MAX_SNIPPET_PER_TOOL = 1200;
const MAX_TOOL_SUMMARY_TOTAL = 2400;

function messageTextContent(m: GroqMessage): string {
  const c = m.content;
  if (c === null || c === undefined) return '';
  if (typeof c === 'string') return c.trim();
  if (Array.isArray(c)) {
    return c
      .filter((p): p is { type: 'text'; text: string } => typeof p === 'object' && p !== null && p.type === 'text')
      .map((p) => p.text)
      .join('\n')
      .trim();
  }
  return '';
}

function sanitizeRecoveryContent(text: string): string {
  if (!text) return '';

  let out = text;

  // Usuń najczęstsze debugowe prefiksy w pojedynczych liniach
  out = out.replace(/^\s*[-*]\s*User input\s*:\s*/im, '');
  out = out.replace(/^\s*[-*]\s*Context\s*:\s*/im, '');
  out = out.replace(/^\s*User input\s*:\s*/im, '');
  out = out.replace(/^\s*Context\s*:\s*/im, '');

  // Usuń ewentualne nagłówki typu "User input: ..." / "Context: ..." w dalszej części tekstu (ostrożnie, tylko na początku linii)
  out = out.replace(/^\s*User input\s*:\s*".*?"\s*$/gim, '');
  out = out.replace(/^\s*Context\s*:\s*$/gim, '');

  // Wyrzuć puste linie powstałe po czyszczeniu (minimalnie)
  out = out
    .split('\n')
    .filter((line, idx, arr) => !(line.trim() === '' && (idx === 0 || idx === arr.length - 1)))
    .join('\n');

  return out.trim();
}

/**
 * Przy fallbacku po pętli narzędzi: zbuduj kontekst bez natywnych `tool` w tablicy,
 * ale z jednym skrótem wyników narzędzi — inaczej model halucynuje `[Tool calls]`.
 * `getGroqResponse` wołamy bez tools; ta wiadomość `user` dostarcza fakty z MCP.
 */
export function buildMessagesForToolFailureRecovery(messages: GroqMessage[]): GroqMessage[] {
  // 1. Zbierz wyniki tool w jedno podsumowanie (max 2400 znaków) – BEZ debugowych prefiksów
  const toolSnippets: string[] = [];
  for (const m of messages) {
    if (m.role !== 'tool') continue;
    const name = typeof m.name === 'string' && m.name.trim() ? m.name.trim() : 'narzędzie';
    const body = typeof m.content === 'string' ? m.content : JSON.stringify(m.content);
    const slice = body.length > MAX_SNIPPET_PER_TOOL ? `${body.slice(0, MAX_SNIPPET_PER_TOOL)}…` : body;
    toolSnippets.push(`Wynik ${name}: ${slice}`);
  }
  let toolSummary =
    toolSnippets.length > 0
      ? toolSnippets.join('\n\n')
      : '';
  if (toolSummary.length > MAX_TOOL_SUMMARY_TOTAL) {
    toolSummary = `${toolSummary.slice(0, MAX_TOOL_SUMMARY_TOTAL)}…`;
  }

  // 2. Odfiltruj role='tool' i assistant z tool_calls → buduj czystą konwersację
  const out: GroqMessage[] = [];
  for (const m of messages) {
    if (m.role === 'tool' || (m.role === 'assistant' && m.tool_calls?.length)) continue;
    const rawText = messageTextContent(m);
    if (!rawText?.trim()) continue;
    const contentText = sanitizeRecoveryContent(rawText);
    if (!contentText) continue;
    out.push({ role: m.role, content: contentText });
  }

  // 3. Najpierw SYSTEM: krótka, rygorystyczna instrukcja dla fallbacku
  out.unshift({
    role: 'system',
    content:
      'Jesteś asystentem biżuterii EPIR i odpowiadasz wyłącznie po polsku. ' +
      'Masz napisać jedną, bardzo krótką i naturalną odpowiedź (maksymalnie 2–3 zdania) bez żadnych nagłówków typu "User:", "Client:", "Context:" ani list punktowanych. ' +
      'Nie opisuj procesu ani narzędzi; odpowiedz jak człowiek: krótko przywitaj się, odnieś się do tego, o co klient pyta, i jeśli czegoś nie rozumiesz, poproś zwięźle o doprecyzowanie zamiast zgadywać.',
  });

  // 4. Jeśli są wyniki narzędzi, dodaj je jako DODATKOWY user message – bez debugowego prefiksu
  if (toolSummary) {
    out.push({
      role: 'user',
      content:
        'Dodatkowe informacje z wewnętrznych narzędzi (potraktuj je tylko jako tło, nie opisuj ich wprost):\n' +
        toolSummary,
    });
  }

  return out;
}
