import {describe, expect, it} from 'vitest';
import {
  EPIR_GOLD_COLLECTION_URL,
  EPIR_HEADER_LOGO_URL,
  KAZKA_HEADER_BRAND,
  KAZKA_HEADER_EMAIL,
  KAZKA_HEADER_NAV_GROUPS,
  KAZKA_HEADER_PHONE,
  KAZKA_HEADER_PHONE_TEL,
  KAZKA_HEADER_PRESENTS,
  KAZKA_HEADER_WHATSAPP_URL,
} from './kazka-header';

describe('kazka-header', () => {
  it('exposes EPIR seller lockup and Kazka presents line', () => {
    expect(KAZKA_HEADER_BRAND).toContain('EPIR Art Jewellery');
    expect(KAZKA_HEADER_PRESENTS).toBe('przedstawia: KAZKA Jewelry');
  });

  it('uses the same graphic logo asset as apex', () => {
    expect(EPIR_HEADER_LOGO_URL).toContain('logo-strona');
    expect(EPIR_HEADER_LOGO_URL).toContain('cdn.shopify.com');
  });

  it('exposes contact constants for footer and other surfaces', () => {
    expect(KAZKA_HEADER_PHONE).toBe('+48 696 55 33 46');
    expect(KAZKA_HEADER_PHONE_TEL).toBe('+48696553346');
    expect(KAZKA_HEADER_EMAIL).toBe('epir@epirbizuteria.pl');
    expect(KAZKA_HEADER_WHATSAPP_URL).toBe('https://wa.me/48696553346');
  });

  it('routes gold CTA to zlota-bizuteria with kazka attribution', () => {
    expect(EPIR_GOLD_COLLECTION_URL).toContain(
      '/collections/zlota-bizuteria',
    );
    expect(EPIR_GOLD_COLLECTION_URL).toContain('utm_source=kazka');
  });

  it('maps header nav groups to dedicated Shopify collections', () => {
    const goldItems = KAZKA_HEADER_NAV_GROUPS.find((g) => g.id === 'gold');
    expect(goldItems?.label).toBe('Biżuteria Złota z Brylantami');
    expect(goldItems?.items.map((item) => item.handle)).toEqual([
      'kazka-pierscionki',
      'kazka-kolczyki',
      'kazka-naszyjniki',
      'kazka-bransoletki',
    ]);

    const gemstoneItems = KAZKA_HEADER_NAV_GROUPS.find(
      (g) => g.id === 'gemstone',
    );
    expect(gemstoneItems?.label).toBe(
      'Biżuteria Złota z Kamieniami Szlachetnymi',
    );
    expect(gemstoneItems?.items.map((item) => item.path)).toEqual([
      '/collections/kazka-szafiry',
      '/collections/kazka-szmaragdy',
      '/collections/kazka-rubiny',
    ]);

    expect(
      KAZKA_HEADER_NAV_GROUPS.flatMap((group) => group.items).every((item) =>
        item.path.startsWith('/collections/'),
      ),
    ).toBe(true);
  });
});
