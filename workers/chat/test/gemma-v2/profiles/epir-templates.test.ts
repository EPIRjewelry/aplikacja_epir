/**
 * E3 profile templates — mutacje:
 * - **M-E3-10** — użyj JAILBREAK_REDIRECT_REPLY → FORM-1 / JB-1 FAIL
 */
import {describe, expect, it} from 'vitest';
import {
  listEpirTemplateStrings,
  templateUsesInformalTy,
} from '../../../src/gemma/profiles/epir';

const FACTS_FORBIDDEN = /https?:\/\/|\d|zł/i;

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
    for (const text of listEpirTemplateStrings('epir-online-store')) {
      const withoutContactPath = text.replace(/\/pages\/kontakt/g, '');
      expect(withoutContactPath).not.toMatch(FACTS_FORBIDDEN);
    }
  });
});
