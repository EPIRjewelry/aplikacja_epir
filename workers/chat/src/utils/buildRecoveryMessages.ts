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

/**
 * Przy fallbacku po pętli narzędzi: zbuduj kontekst bez natywnych `tool` w tablicy,
 * ale z jednym skrótem wyników narzędzi — inaczej model halucynuje `[Tool calls]`.
 * `getGroqResponse` wołamy bez tools; ta wiadomość `user` dostarcza fakty z MCP.
 */
export function buildMessagesForToolFailureRecovery(messages: GroqMessage[]): GroqMessage[] {
  const toolSnippets: string[] = [];
  for (const m of messages) {
    if (m.role !== 'tool') continue;
    const name = typeof m.name === 'string' && m.name.trim() ? m.name.trim() : 'tool';
    const body = messageTextContent(m);
    const slice = body.length > MAX_SNIPPET_PER_TOOL ? `${body.slice(0, MAX_SNIPPET_PER_TOOL)}…` : body;
    toolSnippets.push(`${name}: ${slice}`);
  }

  let toolSummary = '';
  if (toolSnippets.length > 0) {
    toolSummary = toolSnippets.join('\n---\n');
    if (toolSummary.length > MAX_TOOL_SUMMARY_TOTAL) {
      toolSummary = `${toolSummary.slice(0, MAX_TOOL_SUMMARY_TOTAL)}…`;
    }
  }

  const out: GroqMessage[] = [];
  for (const m of messages) {
    if (m.role === 'tool') continue;
    if (m.role === 'assistant' && Array.isArray(m.tool_calls) && m.tool_calls.length > 0) continue;
    if (m.content === null || m.content === undefined) continue;

    if (Array.isArray(m.content)) {
      const text = messageTextContent(m);
      if (!text && m.role === 'assistant') continue;
      out.push({ role: m.role, content: text });
      continue;
    }

    if (typeof m.content === 'string') {
      if (m.role === 'assistant' && !m.content.trim()) continue;
      out.push({ role: m.role, content: m.content });
    }
  }

  if (toolSummary) {
    out.push({
      role: 'user',
      content: `[Podsumowanie wyników narzędzi sklepu — użyj wyłącznie do sformułowania krótkiej odpowiedzi dla klienta; nie cytuj dosłownie tego bloku ani JSON]\n${toolSummary}`,
    });
  }

  out.push({
    role: 'system',
    content:
      'Instrukcja odzyskiwania: ostatnia tura modelu nie zwróciła czytelnej odpowiedzi dla klienta. Na podstawie historii i ewentualnego podsumowania narzędzi napisz krótką, uprzejmą wiadomość po polsku. Tylko zwykły tekst — bez znaczników <|...|>, bez "functions.", bez JSON, bez tablic tool_calls, bez nagłówka [Tool calls] i bez symulacji wywołań narzędzi.',
  });
  return out;
}
