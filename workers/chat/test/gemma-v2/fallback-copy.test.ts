import {describe, expect, it} from 'vitest';
import {gemmaV2EmergencyReply} from '../../src/gemma/fallback';

const TY_FORMS = /\b(ty|tobie|twój|twoja|twoje|cię|ciebie)\b/i;

describe('E1 gemmaV2EmergencyReply copy (Pan/Pani, bez faktów)', () => {
  it('GE exact text and link', () => {
    const text = gemmaV2EmergencyReply('epir-online-store');
    expect(text).toBe(
      'Przepraszamy, asystent jest chwilowo niedostępny. Prosimy Pana/Panią o kontakt przez stronę kontaktu: https://epirbizuteria.pl/pages/kontakt.',
    );
    expect(text).not.toMatch(TY_FORMS);
    expect(text).not.toMatch(/zł/i);
    expect(text).not.toMatch(/formularz/i);
    const withoutUrl = text.replace(/https?:\/\/[^\s]+/g, '');
    expect(withoutUrl).not.toMatch(/\d/);
  });

  it('GZ exact text and link', () => {
    const text = gemmaV2EmergencyReply('epir-zareczyny');
    expect(text).toBe(
      'Przepraszamy, asystent jest chwilowo niedostępny. Prosimy Pana/Panią o kontakt przez stronę kontaktu: https://zareczyny.epirbizuteria.pl/pages/kontakt.',
    );
    expect(text).not.toMatch(TY_FORMS);
    expect(text).not.toMatch(/zł/i);
  });

  it('KAZKA exact text and link', () => {
    const text = gemmaV2EmergencyReply('kazka-hydrogen');
    expect(text).toBe(
      'Przepraszamy, asystent jest chwilowo niedostępny. Prosimy Pana/Panią o kontakt przez stronę kontaktu: https://kazka.epirbizuteria.pl/pages/kontakt.',
    );
    expect(text).not.toMatch(TY_FORMS);
    expect(text).not.toMatch(/zł/i);
  });
});
