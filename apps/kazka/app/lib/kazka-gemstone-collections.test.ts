import {describe, expect, it} from 'vitest';
import {
  GEMSTONE_LINE_HANDLE,
  GEMSTONE_STONE_TILES,
  isGemstoneCollectionHandle,
  isGemstoneHubHandle,
} from './kazka-gemstone-collections';

describe('kazka-gemstone-collections', () => {
  it('lists three stone sub-collections', () => {
    expect(GEMSTONE_STONE_TILES.map((t) => t.label)).toEqual([
      'Szafiry',
      'Rubiny',
      'Szmaragdy',
    ]);
  });

  it('detects gemstone hub and stone handles', () => {
    expect(isGemstoneHubHandle(GEMSTONE_LINE_HANDLE)).toBe(true);
    expect(isGemstoneCollectionHandle('kazka-szafiry')).toBe(true);
    expect(isGemstoneCollectionHandle('kazka-classic')).toBe(false);
  });
});
