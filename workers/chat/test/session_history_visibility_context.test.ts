import { describe, expect, it } from 'vitest';

import { buildCurrentSessionVisibilityContext } from '../src/index';

describe('buildCurrentSessionVisibilityContext', () => {
  it('returns null for the first turn with no earlier session entries', () => {
    expect(buildCurrentSessionVisibilityContext(0)).toBeNull();
    expect(buildCurrentSessionVisibilityContext(1)).toBeNull();
  });

  it('returns an explicit continuity marker when earlier session entries exist', () => {
    const marker = buildCurrentSessionVisibilityContext(4);

    expect(marker).toContain('historia bieżącej sesji');
    expect(marker).toContain('wcześniejszych wpisów z tej rozmowy');
    expect(marker).toContain('Nie twierdź, że nie widzisz bieżącej rozmowy');
  });
});