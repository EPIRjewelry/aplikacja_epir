import {describe, expect, it, vi} from 'vitest';
import {syncTrackingConsentIfEnabled} from './CustomerPrivacyConsentBridge';

describe('CustomerPrivacyConsentBridge syncTrackingConsentIfEnabled', () => {
  it('does not call setTrackingConsent when pushTrackingConsent is false (GZ banner-only)', () => {
    const setTrackingConsent = vi.fn();
    syncTrackingConsentIfEnabled({
      pushTrackingConsent: false,
      customerPrivacy: {setTrackingConsent},
      consentGranted: false,
    });
    expect(setTrackingConsent).not.toHaveBeenCalled();
  });

  it('does not call setTrackingConsent when customerPrivacy is missing', () => {
    const setTrackingConsent = vi.fn();
    syncTrackingConsentIfEnabled({
      pushTrackingConsent: true,
      customerPrivacy: null,
      consentGranted: false,
    });
    expect(setTrackingConsent).not.toHaveBeenCalled();
  });

  it('calls setTrackingConsent when push enabled and API present', () => {
    const setTrackingConsent = vi.fn();
    syncTrackingConsentIfEnabled({
      pushTrackingConsent: true,
      customerPrivacy: {setTrackingConsent},
      consentGranted: true,
    });
    expect(setTrackingConsent).toHaveBeenCalledTimes(1);
    expect(setTrackingConsent).toHaveBeenCalledWith(
      {
        analytics: true,
        marketing: true,
        preferences: true,
        sale_of_data: true,
      },
      expect.any(Function),
    );
  });
});
