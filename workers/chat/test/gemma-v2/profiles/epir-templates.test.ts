/**
 * E3 profile templates — mutacje:
 * - **M-E3-10** — użyj JAILBREAK_REDIRECT_REPLY → FORM-1 / JB-1 FAIL
 */
import {describe, expect, it} from 'vitest';
import {
  contactPageUrl,
  listEpirTemplateStrings,
  templateUsesInformalTy,
} from '../../../src/gemma/profiles/epir';

/** „zł” jako osobny token (nie w słowie „znalazłam”). */
const FACTS_FORBIDDEN = /https?:\/\/|\d|(?<!\p{L})zł(?!\p{L})/iu;

describe('E3 epir profile templates', () => {
  it('T-E3-FORM-1: templates avoid informal ty grid', () => {
    for (const text of listEpirTemplateStrings('epir-online-store')) {
      expect(templateUsesInformalTy(text)).toBe(false);
    }
    for (const text of listEpirTemplateStrings('epir-zareczyny')) {
      expect(templateUsesInformalTy(text)).toBe(false);
    }
  });

  it('T-E3-FACTS-1: templates contain no amounts, http, or phone-like digits', () => {
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
