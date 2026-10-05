import { describe, expect, it } from 'vitest';

import { LUXURY_SYSTEM_PROMPT, KAZKA_HEADLESS_PERSONA_ADDON } from '../src/prompts/luxury-system-prompt';

describe('LUXURY_SYSTEM_PROMPT continuity guardrails', () => {
  it('requires catalog-backed PLN amounts for buyer-facing pricing', () => {
    expect(LUXURY_SYSTEM_PROMPT).toContain('Ceny i waluty (twarde');
    expect(LUXURY_SYSTEM_PROMPT).toContain('search_catalog');
    expect(LUXURY_SYSTEM_PROMPT).toContain('get_cart');
    expect(LUXURY_SYSTEM_PROMPT).toContain('price_display_pl');
  });

  it('keeps current-session continuity and logged-in memory references without buyer-facing disclaimers', () => {
    expect(LUXURY_SYSTEM_PROMPT).toContain('tej samej rozmowie');
    expect(LUXURY_SYSTEM_PROMPT).toContain('bieżącej sesji');
    expect(LUXURY_SYSTEM_PROMPT).toContain('zalogowanego klienta');
    expect(LUXURY_SYSTEM_PROMPT).toContain('Naturalnie nawiązuj do wiadomości z tej samej sesji');
    expect(LUXURY_SYSTEM_PROMPT).not.toContain('nie udawaj');
    expect(LUXURY_SYSTEM_PROMPT).not.toContain('O braku pamięci spoza bieżącej sesji');
  });

  it('treats recap questions as current-session questions by default', () => {
    expect(LUXURY_SYSTEM_PROMPT).toContain('o czym rozmawialiśmy');
    expect(LUXURY_SYSTEM_PROMPT).toContain('czego szukałem');
    expect(LUXURY_SYSTEM_PROMPT).toContain('odpowiedz na podstawie historii bieżącej sesji');
    expect(LUXURY_SYSTEM_PROMPT).not.toContain('wspominaj tylko wtedy');
  });

  it('includes EPIR brand language principles as default', () => {
    expect(LUXURY_SYSTEM_PROMPT).toContain('Język marki EPIR Art Jewellery');
    expect(LUXURY_SYSTEM_PROMPT).toContain('Cień, nie figura');
    expect(LUXURY_SYSTEM_PROMPT).toContain('Żywa powierzchnia');
    expect(LUXURY_SYSTEM_PROMPT).toContain('niedoskonałości');
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

  it('locks page-card quotes, first stone hits, and store facts', () => {
    expect(LUXURY_SYSTEM_PROMPT).toContain('[KARTA PRODUKTU NA TEJ STRONIE]');
    expect(LUXURY_SYSTEM_PROMPT).toContain('price_min_display_pl');
    expect(LUXURY_SYSTEM_PROMPT).toContain('[TRAFENIA KAMIENIA]');
    expect(LUXURY_SYSTEM_PROMPT).toContain('dotyczy wyłącznie srebra');
    expect(LUXURY_SYSTEM_PROMPT).toContain('mniej podatne na zarysowania');
    expect(LUXURY_SYSTEM_PROMPT).toContain('Nie wymyślaj srebrnego asortymentu Kazka');
    expect(LUXURY_SYSTEM_PROMPT).toContain('tylko krótka odmowa');
    expect(KAZKA_HEADLESS_PERSONA_ADDON).toContain('nie używaj progu 500 zł');
    expect(KAZKA_HEADLESS_PERSONA_ADDON).toContain('nie standardowy zwrot w 14 dni');
  });

  it('sends an EPIR custom design to the cocreate page, not the Kazka block', () => {
    expect(LUXURY_SYSTEM_PROMPT).toContain(
      'Gdy klient chce biżuterię wykonaną na własny projekt, skieruj na brief [Zaprojektuj swój model](https://epirbizuteria.pl/pages/zaprojektuj-swoj-model).',
    );
    expect(LUXURY_SYSTEM_PROMPT).toContain('Ten sam adres jest banerem na kolekcji złota.');
    expect(LUXURY_SYSTEM_PROMPT).toContain(
      'Nie mów, że sklep nie ma formularza ani konfiguratora online. Nie odsyłaj do e-maila ani telefonu jako drogi złożenia projektu. Nie podawaj ceny projektu — cenę ustala pracownia.',
    );
    expect(LUXURY_SYSTEM_PROMPT).toContain(
      'Nie odsyłaj klienta EPIR do bloku Kazka „Wspólnie zrealizujmy Twój pomysł” i nie mieszaj katalogu ani głosu Kazka z tą rozmową.',
    );
    expect(LUXURY_SYSTEM_PROMPT).not.toContain('zaproponuj kontakt lub konkretny produkt z katalogu');
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
    expect(KAZKA_HEADLESS_PERSONA_ADDON).toContain(
      'Nie odsyłaj klienta Kazka na https://epirbizuteria.pl/pages/zaprojektuj-swoj-model',
    );
    expect(KAZKA_HEADLESS_PERSONA_ADDON).toContain('Przycisk „Otwórz czat” tylko otwiera tę rozmowę');
  });
});