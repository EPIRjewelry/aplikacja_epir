import { describe, expect, it } from 'vitest';
import { truncateHistory, truncateWithSummary, type Message } from '../src/utils/history';

function makeLongText(label: string): string {
  return `${label} ${'x'.repeat(220)}`;
}

describe('history truncation', () => {
  it('preserves all leading system messages in truncateWithSummary', () => {
    const messages: Message[] = [
      { role: 'system', content: 'Base system prompt' },
      { role: 'system', content: 'Kontekst systemowy: Klient jest zalogowany. Imię klienta: Anna.' },
      { role: 'system', content: 'Kontekst systemowy: Aktualny cart_id sesji to: gid://shopify/Cart/ABC?key=xyz' },
      { role: 'user', content: makeLongText('u1') },
      { role: 'assistant', content: makeLongText('a1') },
      { role: 'user', content: makeLongText('u2') },
      { role: 'assistant', content: makeLongText('a2') },
      { role: 'user', content: makeLongText('u3') },
      { role: 'assistant', content: makeLongText('a3') },
    ];

    const truncated = truncateWithSummary(messages, 220, 2);
    const contents = truncated.map((message) => message.content);

    expect(contents).toContain('Base system prompt');
    expect(contents).toContain('Kontekst systemowy: Klient jest zalogowany. Imię klienta: Anna.');
    expect(contents).toContain('Kontekst systemowy: Aktualny cart_id sesji to: gid://shopify/Cart/ABC?key=xyz');
    expect(contents).toContain(makeLongText('u3'));
    expect(contents).toContain(makeLongText('a3'));
    expect(contents.some((content) => content.includes('Wcześniejsza rozmowa zawierała'))).toBe(true);
  });

  it('preserves all leading system messages in truncateHistory', () => {
    const messages: Message[] = [
      { role: 'system', content: 'Base system prompt' },
      { role: 'system', content: 'Kontekst systemowy: Klient jest zalogowany. Imię klienta: Anna.' },
      { role: 'system', content: 'Kontekst systemowy: storefrontId: online-store' },
      { role: 'user', content: makeLongText('u1') },
      { role: 'assistant', content: makeLongText('a1') },
      { role: 'user', content: makeLongText('u2') },
      { role: 'assistant', content: makeLongText('a2') },
    ];

    const truncated = truncateHistory(messages, 180, 2);
    const contents = truncated.map((message) => message.content);

    expect(contents).toContain('Base system prompt');
    expect(contents).toContain('Kontekst systemowy: Klient jest zalogowany. Imię klienta: Anna.');
    expect(contents).toContain('Kontekst systemowy: storefrontId: online-store');
    expect(contents).toContain(makeLongText('u2'));
    expect(contents).toContain(makeLongText('a2'));
  });
});