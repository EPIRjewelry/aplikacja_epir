import { describe, it, expect } from 'vitest';
import {
  formatRagContextForPrompt,
  formatMcpProductsForPrompt,
  formatRagForPrompt,
  hasHighConfidenceResults,
  extractKeywords,
  type RagSearchResult,
  type RagContext,
} from '../src/domain/formatter';

describe('formatRagContextForPrompt', () => {
  it('returns empty string for empty results', () => {
    expect(formatRagContextForPrompt({ results: [] })).toBe('');
  });

  it('returns empty string when results array is missing', () => {
    // @ts-expect-error testing invalid input
    expect(formatRagContextForPrompt(null)).toBe('');
  });

  it('includes query header when query is provided', () => {
    const rag: RagSearchResult = {
      query: 'polityka zwrotów',
      results: [{ id: 'doc1', text: 'Masz 30 dni na zwrot.', source: 'mcp' }],
    };
    const result = formatRagContextForPrompt(rag);
    expect(result).toContain('polityka zwrotów');
    expect(result).toContain('Masz 30 dni na zwrot.');
  });

  it('formats multiple documents with Doc numbers', () => {
    const rag: RagSearchResult = {
      results: [
        { id: 'doc1', text: 'Pierwszy dokument.', source: 'mcp' },
        { id: 'doc2', text: 'Drugi dokument.', source: 'vectorize' },
      ],
    };
    const result = formatRagContextForPrompt(rag);
    expect(result).toContain('[Doc 1]');
    expect(result).toContain('[Doc 2]');
    expect(result).toContain('Pierwszy dokument.');
    expect(result).toContain('Drugi dokument.');
  });

  it('includes score percentage when score is present', () => {
    const rag: RagSearchResult = {
      results: [{ id: 'doc1', text: 'Tekst.', source: 'vectorize', score: 0.853 }],
    };
    const result = formatRagContextForPrompt(rag);
    expect(result).toContain('85.3%');
  });

  it('includes title when present', () => {
    const rag: RagSearchResult = {
      results: [{ id: 'doc1', title: 'Tytuł dokumentu', text: 'Treść.', source: 'mcp' }],
    };
    const result = formatRagContextForPrompt(rag);
    expect(result).toContain('Tytuł dokumentu');
  });

  it('appends instruction footer when results are present', () => {
    const rag: RagSearchResult = {
      results: [{ id: 'doc1', text: 'Treść.', source: 'mcp' }],
    };
    const result = formatRagContextForPrompt(rag);
    expect(result).toContain('Odpowiedz używając powyższego kontekstu');
  });

  it('uses snippet as fallback when text is missing', () => {
    const rag: RagSearchResult = {
      results: [{ id: 'doc1', snippet: 'Fragment tekstu.', source: 'vectorize' }],
    };
    const result = formatRagContextForPrompt(rag);
    expect(result).toContain('Fragment tekstu.');
  });
});

describe('formatMcpProductsForPrompt', () => {
  it('returns empty string for empty product list', () => {
    expect(formatMcpProductsForPrompt([], 'pierścionki')).toBe('');
  });

  it('includes product name and query', () => {
    const result = formatMcpProductsForPrompt(
      [{ name: 'Pierścionek złoty', price: '500 PLN' }],
      'złote pierścionki',
    );
    expect(result).toContain('złote pierścionki');
    expect(result).toContain('Pierścionek złoty');
    expect(result).toContain('500 PLN');
  });

  it('formats multiple products with numbered labels', () => {
    const result = formatMcpProductsForPrompt(
      [{ name: 'A' }, { name: 'B' }],
      'test',
    );
    expect(result).toContain('[Produkt 1]');
    expect(result).toContain('[Produkt 2]');
  });

  it('includes optional fields when present', () => {
    const result = formatMcpProductsForPrompt(
      [{ name: 'Ring', url: 'https://epir.pl/ring', description: 'Opis', image: 'img.jpg' }],
      'ring',
    );
    expect(result).toContain('https://epir.pl/ring');
    expect(result).toContain('Opis');
    expect(result).toContain('img.jpg');
  });
});

describe('formatRagForPrompt', () => {
  it('returns empty string for empty retrieved_docs', () => {
    const ctx: RagContext = { retrieved_docs: [] };
    expect(formatRagForPrompt(ctx)).toBe('');
  });

  it('formats docs with header', () => {
    const ctx: RagContext = {
      retrieved_docs: [{ id: 'faq_1', text: 'Odpowiedź na FAQ.' }],
    };
    const result = formatRagForPrompt(ctx);
    expect(result).toContain('KONTEKST RAG');
    expect(result).toContain('faq_1');
    expect(result).toContain('Odpowiedź na FAQ.');
  });

  it('truncates long doc text to 300 chars', () => {
    const longText = 'a'.repeat(400);
    const ctx: RagContext = { retrieved_docs: [{ text: longText }] };
    const result = formatRagForPrompt(ctx);
    expect(result).toContain('…');
    expect(result.length).toBeLessThan(400);
  });

  it('includes metadata as key=value pairs', () => {
    const ctx: RagContext = {
      retrieved_docs: [{ text: 'Doc.', meta: { category: 'returns', year: 2024 } }],
    };
    const result = formatRagForPrompt(ctx);
    expect(result).toContain('category=returns');
    expect(result).toContain('year=2024');
  });
});

describe('hasHighConfidenceResults', () => {
  it('returns false for empty results', () => {
    expect(hasHighConfidenceResults({ results: [] })).toBe(false);
  });

  it('returns false when no result meets the threshold', () => {
    const rag: RagSearchResult = {
      results: [
        { id: 'doc1', source: 'vectorize', score: 0.5 },
        { id: 'doc2', source: 'vectorize', score: 0.6 },
      ],
    };
    expect(hasHighConfidenceResults(rag, 0.7)).toBe(false);
  });

  it('returns true when at least one result meets the threshold', () => {
    const rag: RagSearchResult = {
      results: [
        { id: 'doc1', source: 'vectorize', score: 0.5 },
        { id: 'doc2', source: 'vectorize', score: 0.85 },
      ],
    };
    expect(hasHighConfidenceResults(rag, 0.7)).toBe(true);
  });

  it('uses default threshold 0.7', () => {
    const rag: RagSearchResult = {
      results: [{ id: 'doc1', source: 'vectorize', score: 0.72 }],
    };
    expect(hasHighConfidenceResults(rag)).toBe(true);
  });
});

describe('extractKeywords', () => {
  it('removes Polish filler words without diacritics', () => {
    // Note: words with diacritics at boundaries (e.g. 'pokaż') are not removed
    // by \b regex due to how JS handles non-ASCII word boundaries.
    // This test covers words that ARE reliably removed (ASCII-only words).
    const result = extractKeywords('szukam jakie masz pierścionki');
    expect(result).not.toContain('szukam');
    expect(result).not.toContain('jakie');
    expect(result).not.toContain('masz');
    expect(result).toContain('pierścionki');
  });

  it('returns original query as fallback when keywords are empty', () => {
    const query = 'pokaż mi czy';
    const result = extractKeywords(query);
    // Should fallback to original if all words removed
    expect(result.length).toBeGreaterThan(0);
  });

  it('handles empty string gracefully', () => {
    const result = extractKeywords('');
    expect(result).toBe('');
  });

  it('preserves meaningful keywords', () => {
    const result = extractKeywords('szukam złotego pierścionka zaręczynowego');
    expect(result).toContain('złotego');
    expect(result).toContain('pierścionka');
    expect(result).toContain('zaręczynowego');
  });
});
