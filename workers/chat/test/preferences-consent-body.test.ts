import {describe, expect, it} from 'vitest';
import {
  extractPreferencesConsentFromBody,
  resolvePreferencesConsentFromBody,
} from '../src/buyer/session-context';

describe('preferences_consent body extract', () => {
  it('missing field resolves to 0', () => {
    expect(resolvePreferencesConsentFromBody({})).toBe(0);
    expect(extractPreferencesConsentFromBody({})).toBeUndefined();
  });

  it('true/false extract', () => {
    expect(extractPreferencesConsentFromBody({preferences_consent: true})).toBe(1);
    expect(extractPreferencesConsentFromBody({preferences_consent: false})).toBe(0);
  });
});
