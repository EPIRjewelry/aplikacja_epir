import { describe, expect, it } from 'vitest';
import { buildGemmaDigestMarkdown } from './operator-gemma-digest';

describe('buildGemmaDigestMarkdown', () => {
  it('renders who and topic', () => {
    const md = buildGemmaDigestMarkdown(
      [
        {
          session_id: 'sess-abc123',
          customer_id: 'gid://shopify/Customer/1',
          first_name: 'Anna',
          last_name: 'Kowalska',
          storefront_id: 'kazka',
          user_excerpt: 'Szukam pierścionka zaręczynowego z szafirem',
          assistant_excerpt: 'Chętnie pomogę dobrać pierścionek…',
          last_ts: Date.now(),
        },
      ],
      '2026-06-17',
    );
    expect(md).toContain('Anna Kowalska');
    expect(md).toContain('kazka');
    expect(md).toContain('szafirem');
    expect(md).toContain('Gemma');
  });
});
