import type { GroqMessage } from '../ai-client';

/**
 * Przy fallbacku po pętli narzędzi: usuń wiadomości `tool` oraz asystenta z `tool_calls`,
 * żeby `getGroqResponse` (bez tools) nie generował kolejnych wycieków markupu narzędzi.
 */
export function buildMessagesForToolFailureRecovery(messages: GroqMessage[]): GroqMessage[] {
  const out: GroqMessage[] = [];
  for (const m of messages) {
    if (m.role === 'tool') continue;
    if (m.role === 'assistant' && Array.isArray(m.tool_calls) && m.tool_calls.length > 0) continue;
    if (m.content === null || m.content === undefined) continue;

    if (Array.isArray(m.content)) {
      const text = m.content
        .filter((p): p is { type: 'text'; text: string } => typeof p === 'object' && p !== null && p.type === 'text')
        .map((p) => p.text)
        .join('\n')
        .trim();
      if (!text && m.role === 'assistant') continue;
      out.push({ role: m.role, content: text });
      continue;
    }

    if (typeof m.content === 'string') {
      if (m.role === 'assistant' && !m.content.trim()) continue;
      out.push({ role: m.role, content: m.content });
    }
  }

  out.push({
    role: 'system',
    content:
      'Instrukcja odzyskiwania: ostatnia tura modelu nie zwróciła czytelnej odpowiedzi dla klienta. Napisz krótką, uprzejmą wiadomość po polsku na podstawie kontekstu rozmowy. Tylko zwykły tekst — bez znaczników <|...|>, bez "functions." i bez JSON ani symulacji wywołań narzędzi.',
  });
  return out;
}
