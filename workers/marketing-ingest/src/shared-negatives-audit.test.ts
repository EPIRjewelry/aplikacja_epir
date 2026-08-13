import { describe, expect, it } from 'vitest';
import { classifyLeakTerm } from './shared-negatives-audit';

describe('classifyLeakTerm', () => {
  it('flags generic jewelry and artisan competitors', () => {
    expect(classifyLeakTerm('jubiler')).toBe('generic_jewelry');
    expect(classifyLeakTerm('biżuteria')).toBe('generic_jewelry');
    expect(classifyLeakTerm('kopiszka pierścionek')).toBe('artisan_competitor');
    expect(classifyLeakTerm('epir biżuteria')).toBeNull();
  });
});
