import {describe, expect, it} from 'vitest';
import {META_PIXEL_ID} from './meta-pixel-id';

describe('meta-pixel', () => {
  it('uses fixed pixel id for Kazka catalog alignment', () => {
    expect(META_PIXEL_ID).toBe('1320796521913985');
  });
});
