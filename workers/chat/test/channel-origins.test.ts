import { describe, expect, it } from 'vitest';
import {
  EPIR_CUSTOM_ORDER_FORM_URL,
  defaultCustomOrderUrlForChannel,
  hostAllowedForChannel,
  resolveUrlForChannel,
  validateCustomOrderUrl,
} from '../src/buyer/channel-origins';

describe('channel-origins custom order + host', () => {
  it('GZ (epir-zareczyny) uses hardcoded EPIR custom order form URL', () => {
    expect(defaultCustomOrderUrlForChannel('epir-zareczyny')).toBe(
      EPIR_CUSTOM_ORDER_FORM_URL,
    );
    expect(EPIR_CUSTOM_ORDER_FORM_URL).toBe(
      'https://epirbizuteria.pl/pages/zaprojektuj-swoj-model',
    );
  });

  it('GE uses same EPIR form; GK has no default (profile only)', () => {
    expect(defaultCustomOrderUrlForChannel('epir-online-store')).toBe(
      EPIR_CUSTOM_ORDER_FORM_URL,
    );
    expect(defaultCustomOrderUrlForChannel('kazka-hydrogen')).toBeNull();
  });

  it('resolves relative KB path against channel origin', () => {
    expect(resolveUrlForChannel('/pages/zaprojektuj-swoj-model', 'epir-online-store')).toBe(
      'https://epirbizuteria.pl/pages/zaprojektuj-swoj-model',
    );
    expect(resolveUrlForChannel('/pages/foo', 'kazka-hydrogen')).toBe(
      'https://kazka.epirbizuteria.pl/pages/foo',
    );
  });

  it('GK rejects EPIR host; accepts kazka custom_order_url with hash', () => {
    expect(hostAllowedForChannel('epirbizuteria.pl', 'kazka-hydrogen')).toBe(false);
    const kazka = validateCustomOrderUrl(
      'https://kazka.epirbizuteria.pl/#kazka-custom-order',
      'kazka-hydrogen',
    );
    expect(kazka).toBe('https://kazka.epirbizuteria.pl/#kazka-custom-order');
  });

  it('GZ allowlist includes epirbizuteria.pl for the EPIR form', () => {
    expect(hostAllowedForChannel('epirbizuteria.pl', 'epir-zareczyny')).toBe(true);
    expect(validateCustomOrderUrl(EPIR_CUSTOM_ORDER_FORM_URL, 'epir-zareczyny')).toBe(
      EPIR_CUSTOM_ORDER_FORM_URL,
    );
  });
});
