import {describe, expect, it, vi, beforeEach} from 'vitest';

vi.mock('@epir/ui', () => ({
  readShopifyMarketingProcessingAllowed: vi.fn(),
}));

import {readShopifyMarketingProcessingAllowed} from '@epir/ui';
import {getMetaPixelConsentSnapshot, isMetaPixelConsentGranted} from './meta-pixel';

describe('meta-pixel consent (live read)', () => {
  beforeEach(() => {
    vi.mocked(readShopifyMarketingProcessingAllowed).mockReset();
  });

  it('isMetaPixelConsentGranted reads API at call time, not a stale mount false', () => {
    vi.mocked(readShopifyMarketingProcessingAllowed).mockReturnValue(null);
    expect(isMetaPixelConsentGranted()).toBe(false);
    vi.mocked(readShopifyMarketingProcessingAllowed).mockReturnValue(true);
    expect(isMetaPixelConsentGranted()).toBe(true);
  });

  it('getMetaPixelConsentSnapshot matches marketing === true only', () => {
    vi.mocked(readShopifyMarketingProcessingAllowed).mockReturnValue(false);
    expect(getMetaPixelConsentSnapshot()).toBe(false);
    vi.mocked(readShopifyMarketingProcessingAllowed).mockReturnValue(true);
    expect(getMetaPixelConsentSnapshot()).toBe(true);
  });
});
