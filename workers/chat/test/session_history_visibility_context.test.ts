import { describe, expect, it } from 'vitest';

import { buildCurrentSessionVisibilityContext } from '../src/index';

describe('buildCurrentSessionVisibilityContext', () => {
  it('returns null for the first turn with no earlier session entries', () => {
    expect(buildCurrentSessionVisibilityContext(0)).toBeNull();
    expect(buildCurrentSessionVisibilityContext(1)).toBeNull();
  });

  it('returns null also for later turns to keep prefix caching stable', () => {
    expect(buildCurrentSessionVisibilityContext(2)).toBeNull();
    expect(buildCurrentSessionVisibilityContext(4)).toBeNull();
    expect(buildCurrentSessionVisibilityContext(10)).toBeNull();
  });
});