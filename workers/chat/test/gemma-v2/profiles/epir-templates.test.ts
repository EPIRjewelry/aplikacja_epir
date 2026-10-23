/**
 * E3 profile templates — mutacje:
 * - **M-E3-10** — użyj JAILBREAK_REDIRECT_REPLY → FORM-1 / JB-1 FAIL
 * - **M-E5-5** — względna ścieżka w odmowie → T-E5-REFUSAL-1 FAIL
 * - **M-E5-6** — stary TY_GRID → T-E5-TY-1 FAIL
 */
import {describe, expect, it} from 'vitest';
import {
  contactPageUrl,
  epirRefusalReply,
  listEpirTemplateStrings,
  templateStartsWithProszePana,
  templateUsesInformalTy,
} from '../../../src/gemma/profiles/epir';

/** „zł” jako osobny token (nie w słowie „znalazłam”). */
const FACTS_FORBIDDEN = /https?:\/\/|\d|(?<!\p{L})zł(?!\p{L})/iu;

describe('E3 epir profile templates', () => {
  it('T-E5-TY-1: TY_GRID detects cię; ignores Pan/Pani and unrelated words', () => {
    expect(templateUsesInformalTy('Polecam cię serdecznie')).toBe(true);
    expect(templateUsesInformalTy('Proszę Pana/Panią o kontakt.')).toBe(false);
    expect(templateUsesInformalTy('kobiety szukają prezentu')).toBe(false);
    expect(templateUsesInformalTy('twardy metal')).toBe(false);
  });

  it('T-E5-REFUSAL-1: refusal uses contactPageUrl not bare path', () => {
    const url = contactPageUrl('epir-online-store');
    const reply = epirRefusalReply('epir-online-store');
    expect(reply).toContain(url);
    expect(reply).not.toMatch(/kontaktu: \/pages\/kontakt\./);
  });

  it('T-FIX-6: templates do not start with „Proszę Pana”', () => {
    for (const text of listEpirTemplateStrings('epir-online-store')) {
      expect(templateStartsWithProszePana(text)).toBe(false);
    }
  });

  it('T-E3-FORM-1: templates avoid informal ty grid', () => {
    for (const text of listEpirTemplateStrings('epir-online-store')) {
      expect(templateUsesInformalTy(text)).toBe(false);
    }
    for (const text of listEpirTemplateStrings('epir-zareczyny')) {
      expect(templateUsesInformalTy(text)).toBe(false);
    }
  });

  it('T-E5-FACTS-1 / T-E3-FACTS-1: listEpirTemplateStrings — no stray amounts or http', () => {
    for (const channel of ['epir-online-store', 'epir-zareczyny'] as const) {
      for (const text of listEpirTemplateStrings(channel)) {
        // Wycinamy tylko URL-e wstawiane przez kod (kontakt z channel-origins, fikcyjny link fixture).
        const stripped = text
          .split(contactPageUrl(channel))
          .join('')
          .replace(/\/pages\/kontakt/g, '')
          .replace('g1: /products/fikcyjny-parity', '')
          .replace(/\/products\/fikcyjny-parity/g, '');
        expect(stripped).not.toMatch(FACTS_FORBIDDEN);
      }
    }
  });
});
