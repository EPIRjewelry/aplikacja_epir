import {describe, expect, it} from 'vitest';
import {
  extractProductHandlesFromAssistantText,
  PREV_RESPONSE_HEADER,
} from '../src/buyer/previous-response-products';

describe('previous-response-products', () => {
  it('extracts handles in order from assistant markdown links', () => {
    const text = [
      'Polecam [A](https://epirbizuteria.pl/products/pierscionek-a).',
      'Albo [B](https://www.epirbizuteria.pl/products/pierscionek-b).',
    ].join(' ');
    const handles = extractProductHandlesFromAssistantText(text, 'epir-online-store');
    expect(handles).toEqual(['pierscionek-a', 'pierscionek-b']);
  });

  it('ignores foreign hosts', () => {
    const handles = extractProductHandlesFromAssistantText(
      '[X](https://example.com/products/foo)',
      'epir-online-store',
    );
    expect(handles).toEqual([]);
  });

  it('accepts apex epir host on epir-zareczyny channel (legacy links)', () => {
    const handles = extractProductHandlesFromAssistantText(
      '[A](https://epirbizuteria.pl/products/legacy-ring)',
      'epir-zareczyny',
    );
    expect(handles).toEqual(['legacy-ring']);
  });

  it('exports header constant for compose block', () => {
    expect(PREV_RESPONSE_HEADER).toContain('POPRZEDNIEJ');
  });
});
