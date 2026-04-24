import type { GroqMessage, KimiContentPart } from '../ai-client';

/** Nagłówek bloku ephemera wszywanego w ostatni `user` (diagnostyka / testy). */
export const EPHEMERAL_USER_CONTEXT_HEADER = '[BIEŻĄCA TURA – KONTEKST DLA MODELOK]';

/**
 * Wpina zmienny kontekst tury w treść ostatniej wiadomości użytkownika (zgodnie z
 * zaleceniem Workers AI: statyczny prefiks na początku, zmienne na końcu promptu).
 * Zwraca płytką kopię tablicy z podmianą jednej wiadomości.
 */
export function mergeEphemeralBlockIntoLastUser(
  messages: GroqMessage[],
  block: string,
): GroqMessage[] {
  const trimmed = block.trim();
  if (!trimmed) {
    return messages.map((m) => ({ ...m }));
  }

  const fullBlock = `${EPHEMERAL_USER_CONTEXT_HEADER}\n${trimmed}`;

  const out = messages.map((m) => ({ ...m }));
  for (let i = out.length - 1; i >= 0; i--) {
    if (out[i].role !== 'user') continue;

    const content = out[i].content;
    if (content === null || content === undefined) {
      out[i] = { ...out[i], content: fullBlock };
      return out;
    }
    if (typeof content === 'string') {
      const merged = content.trim() ? `${fullBlock}\n\n${content}` : fullBlock;
      out[i] = { ...out[i], content: merged };
      return out;
    }
    if (Array.isArray(content)) {
      const parts = [...content] as KimiContentPart[];
      if (parts.length > 0 && (parts[0] as KimiContentPart).type === 'text') {
        const first = parts[0] as { type: 'text'; text: string };
        out[i] = {
          ...out[i],
          content: [
            { type: 'text', text: `${fullBlock}\n\n${first.text}` },
            ...parts.slice(1),
          ] as KimiContentPart[],
        };
        return out;
      }
      out[i] = {
        ...out[i],
        content: [{ type: 'text', text: fullBlock }, ...parts] as KimiContentPart[],
      };
      return out;
    }
    out[i] = { ...out[i], content: fullBlock };
    return out;
  }

  return [...out, { role: 'user' as const, content: fullBlock }];
}

