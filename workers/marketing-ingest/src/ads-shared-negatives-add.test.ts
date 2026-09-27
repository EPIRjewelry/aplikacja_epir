import { describe, expect, it } from 'vitest';
import {
  planMissingSharedNegatives,
  refuseForbiddenKeywords,
  SHARED_MARKI_NEGATIVES_PHRASE,
} from './ads-shared-negatives-add';

describe('planMissingSharedNegatives', () => {
  it('skips keywords already on the list (case insensitive)', () => {
    const missing = planMissingSharedNegatives(['Vintage', 'bemoon'], ['vintage', 'kamyki moniki']);
    expect(missing).toEqual(['kamyki moniki']);
  });

  it('includes kamyki and vintage in the batch SSOT', () => {
    expect(SHARED_MARKI_NEGATIVES_PHRASE).toContain('kamyki moniki');
    expect(SHARED_MARKI_NEGATIVES_PHRASE).toContain('vintage');
    expect(SHARED_MARKI_NEGATIVES_PHRASE).not.toContain('jubiler');
  });
});

describe('refuseForbiddenKeywords', () => {
  it('flags jubiler variants', () => {
    expect(refuseForbiddenKeywords(['kamyki moniki', 'jubiler', 'Jubiler Wrocław'])).toEqual([
      'jubiler',
      'Jubiler Wrocław',
    ]);
  });
});
