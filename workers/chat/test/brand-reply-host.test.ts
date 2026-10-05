import {describe, expect, it} from 'vitest';
import {stripForeignBrandLinks} from '../src/brand-reply-host';

describe('stripForeignBrandLinks', () => {
  it('drops a Kazka product link from an EPIR reply', () => {
    const locked = stripForeignBrandLinks(
      'Na briefie jest [pierścionek](https://kazka.epirbizuteria.pl/products/soliter) oraz https://epirbizuteria.pl/pages/zaprojektuj-swoj-model.',
      'epir',
    );
    expect(locked.stripped).toBe(true);
    expect(locked.text).not.toContain('kazka.epirbizuteria.pl');
    expect(locked.text).toContain('pierścionek');
    expect(locked.text).toContain('https://epirbizuteria.pl/pages/zaprojektuj-swoj-model');
  });

  it('drops an apex link from a Kazka reply and keeps the Kazka host', () => {
    const locked = stripForeignBrandLinks(
      'Karta: [Soliter](https://kazka.epirbizuteria.pl/products/soliter). Brief EPIR: https://www.epirbizuteria.pl/pages/zaprojektuj-swoj-model.',
      'kazka',
    );
    expect(locked.stripped).toBe(true);
    expect(locked.text).toContain('https://kazka.epirbizuteria.pl/products/soliter');
    expect(locked.text).not.toContain('www.epirbizuteria.pl');
    expect(locked.text).not.toContain('https://epirbizuteria.pl');
  });

  it('drops a Kazka host written without a scheme on EPIR', () => {
    const locked = stripForeignBrandLinks(
      'Zobacz kazka.epirbizuteria.pl/products/soliter albo epirbizuteria.pl/products/obraczka.',
      'epir',
    );
    expect(locked.stripped).toBe(true);
    expect(locked.text).not.toContain('kazka.epirbizuteria.pl');
    expect(locked.text).toContain('epirbizuteria.pl/products/obraczka');
  });

  it('drops a bare apex host on Kazka without touching the Kazka subdomain', () => {
    const locked = stripForeignBrandLinks(
      'Zostaje kazka.epirbizuteria.pl/products/soliter, odpada epirbizuteria.pl/products/obraczka.',
      'kazka',
    );
    expect(locked.stripped).toBe(true);
    expect(locked.text).toContain('kazka.epirbizuteria.pl/products/soliter');
    expect(locked.text).not.toContain('epirbizuteria.pl/products/obraczka');
  });

  it('leaves checkout and the in-page Kazka brief alone', () => {
    const text =
      'Koszyk: https://epir-art-silver-jewellery.myshopify.com/cart/c/abc. Brief: [Wspólnie](#kazka-custom-order).';
    expect(stripForeignBrandLinks(text, 'kazka').text).toBe(text);
    expect(stripForeignBrandLinks(text, 'epir').stripped).toBe(false);
  });
});
