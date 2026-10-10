import { describe, expect, it } from 'vitest';

import { LUXURY_SYSTEM_PROMPT, KAZKA_HEADLESS_PERSONA_ADDON } from '../src/prompts/luxury-system-prompt';

describe('LUXURY_SYSTEM_PROMPT continuity guardrails', () => {
  it('requires catalog-backed PLN amounts for buyer-facing pricing', () => {
    expect(LUXURY_SYSTEM_PROMPT).toContain('Ceny i waluty (twarde');
    expect(LUXURY_SYSTEM_PROMPT).toContain('search_catalog');
    expect(LUXURY_SYSTEM_PROMPT).toContain('get_cart');
    expect(LUXURY_SYSTEM_PROMPT).not.toContain('price_display_pl');
    expect(LUXURY_SYSTEM_PROMPT).not.toContain('price_minor');
  });

  it('keeps current-session continuity references', () => {
    expect(LUXURY_SYSTEM_PROMPT).toContain('bieżącej sesji');
    expect(LUXURY_SYSTEM_PROMPT).not.toContain('nie udawaj');
  });

  it('treats recap questions as current-session questions by default', () => {
    expect(LUXURY_SYSTEM_PROMPT).toContain('odpowiedz na podstawie historii bieżącej sesji');
    expect(LUXURY_SYSTEM_PROMPT).toContain('o czym rozmawialiśmy');
  });

  it('restores memory and T1/T2 without cart_id leakage', () => {
    expect(LUXURY_SYSTEM_PROMPT).toContain('firstName: Krzysztof');
    expect(LUXURY_SYSTEM_PROMPT).toContain('Nie proś klienta o imię');
    expect(LUXURY_SYSTEM_PROMPT).not.toContain('cart_id');
    expect(LUXURY_SYSTEM_PROMPT).toContain('currentPath zawiera /products/');
  });

  it('alternative stone only with reason from search_catalog results', () => {
    expect(LUXURY_SYSTEM_PROMPT).toContain('logiczny powód (kolor, forma, szlif)');
    expect(LUXURY_SYSTEM_PROMPT).toContain('wyłącznie produkty z wyniku search_catalog tej tury');
  });

  it('includes EPIR brand language principles as default', () => {
    expect(LUXURY_SYSTEM_PROMPT).toContain('Język marki EPIR Art Jewellery');
    expect(LUXURY_SYSTEM_PROMPT).toContain('Cień, nie figura');
    expect(LUXURY_SYSTEM_PROMPT).toContain('Żywa powierzchnia');
    expect(LUXURY_SYSTEM_PROMPT).toContain('niedoskonałości');
  });

  it('includes Pan/Pani form in base prompt', () => {
    expect(LUXURY_SYSTEM_PROMPT).toContain('Pan/Pani');
  });

  it('includes Kazka headless persona addon', () => {
    expect(KAZKA_HEADLESS_PERSONA_ADDON).toContain('Kazka Jewelry');
    expect(KAZKA_HEADLESS_PERSONA_ADDON).toContain('katalog sklepu');
    expect(KAZKA_HEADLESS_PERSONA_ADDON).toContain('Nigdy nie używaj słowa „drop”');
    expect(KAZKA_HEADLESS_PERSONA_ADDON).toContain('EPIR');
    expect(KAZKA_HEADLESS_PERSONA_ADDON).toContain('geometryczny spokój');
  });

  it('forbids hallucinated Kazka contact details', () => {
    expect(KAZKA_HEADLESS_PERSONA_ADDON).toContain('Zakaz zmyślonych numerów');
    expect(KAZKA_HEADLESS_PERSONA_ADDON).toContain('+48 696 55 33 46');
    expect(KAZKA_HEADLESS_PERSONA_ADDON).toContain('epir@epirbizuteria.pl');
    expect(KAZKA_HEADLESS_PERSONA_ADDON).toContain('wyłącznie numerem +48 696 55 33 46');
    expect(KAZKA_HEADLESS_PERSONA_ADDON).toContain('000 000 000');
    expect(KAZKA_HEADLESS_PERSONA_ADDON).toContain('nie podawaj zmyślonych danych kontaktowych');
  });

  it('locks page product block and KB for store facts', () => {
    expect(LUXURY_SYSTEM_PROMPT).toContain('[PRODUKT NA STRONIE]');
    expect(LUXURY_SYSTEM_PROMPT).not.toContain('[TRAFENIA KAMIENIA]');
    expect(LUXURY_SYSTEM_PROMPT).not.toContain('catalog_search');
    expect(LUXURY_SYSTEM_PROMPT).toContain('search_shop_policies_and_faqs');
    expect(LUXURY_SYSTEM_PROMPT).toContain('opis produktu tego nie podaje');
    expect(KAZKA_HEADLESS_PERSONA_ADDON).toContain('search_shop_policies_and_faqs');
    expect(KAZKA_HEADLESS_PERSONA_ADDON).toContain('Nie obiecuj darmowej zmiany rozmiaru');
  });

  it('sends an EPIR custom design to the cocreate page, not the Kazka block', () => {
    expect(LUXURY_SYSTEM_PROMPT).toContain(
      'Gdy klient chce biżuterię wykonaną na własny projekt, skieruj na brief [Zaprojektuj swój model](https://epirbizuteria.pl/pages/zaprojektuj-swoj-model).',
    );
    expect(KAZKA_HEADLESS_PERSONA_ADDON).toContain(
      'Nie odsyłaj klienta Kazka na https://epirbizuteria.pl/pages/zaprojektuj-swoj-model',
    );
  });

  it('tells Kazka Gemma to fill the existing custom brief instead of sending email', () => {
    expect(KAZKA_HEADLESS_PERSONA_ADDON).toContain('Wspólnie zrealizujmy Twój pomysł');
    expect(KAZKA_HEADLESS_PERSONA_ADDON).toContain('#kazka-custom-order');
    expect(KAZKA_HEADLESS_PERSONA_ADDON).toContain(
      'Uzupełniasz wyłącznie pola, które klient już powiedział.',
    );
    expect(KAZKA_HEADLESS_PERSONA_ADDON).toContain(
      'Nie podawaj ceny projektu na zamówienie — cenę ustala pracownia.',
    );
    expect(KAZKA_HEADLESS_PERSONA_ADDON).toContain(
      'Nie odsyłaj do e-maila ani telefonu jako drogi złożenia projektu.',
    );
    expect(KAZKA_HEADLESS_PERSONA_ADDON).toContain('Przycisk „Otwórz czat” tylko otwiera tę rozmowę');
  });
});
