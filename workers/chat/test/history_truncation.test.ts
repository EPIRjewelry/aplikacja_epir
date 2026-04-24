import { describe, expect, it } from 'vitest';
import { truncateHistory, truncateWithSummary, type Message } from '../src/utils/history';

function makeLongText(label: string): string {
  return `${label} ${'x'.repeat(220)}`;
}

describe('history truncation', () => {
  it('preserves all leading system messages in truncateWithSummary (ephemeral lives in last user)', () => {
    const lastUser = `[BIEŻĄCA TURA – KONTEKST DLA MODELOK]
[BIEŻĄCY KONTEKST – sklep / sesja]
Kontekst systemowy: storefrontId: online-store

${makeLongText('u3')}`;
    const messages: Message[] = [
      { role: 'system', content: 'Base system prompt' },
      { role: 'user', content: makeLongText('u1') },
      { role: 'assistant', content: makeLongText('a1') },
      { role: 'user', content: makeLongText('u2') },
      { role: 'assistant', content: makeLongText('a2') },
      { role: 'user', content: lastUser },
      { role: 'assistant', content: makeLongText('a3') },
    ];

    // ~453 est. tokenów > max → podsumowanie; próg 400 wymusza trunc, wystarczający by zachować u3+a3 w ogonie.
    const truncated = truncateWithSummary(messages, 400, 2);
    const contents = truncated.map((message) => message.content);

    expect(contents).toContain('Base system prompt');
    expect(contents.some((c) => c.includes(makeLongText('u3')))).toBe(true);
    expect(contents.some((c) => c.includes(makeLongText('a3')))).toBe(true);
    expect(contents.some((content) => content.includes('Wcześniejsza rozmowa zawierała'))).toBe(true);
  });

  it('preserves all leading system messages in truncateHistory', () => {
    const messages: Message[] = [
      { role: 'system', content: 'Base system prompt' },
      { role: 'user', content: makeLongText('u1') },
      { role: 'assistant', content: makeLongText('a1') },
      { role: 'user', content: makeLongText('u2') },
      { role: 'assistant', content: makeLongText('a2') },
    ];

    const truncated = truncateHistory(messages, 180, 2);
    const contents = truncated.map((message) => message.content);

    expect(contents).toContain('Base system prompt');
    expect(contents.some((c) => c.includes(makeLongText('u2')))).toBe(true);
    expect(contents.some((c) => c.includes(makeLongText('a2')))).toBe(true);
  });
});