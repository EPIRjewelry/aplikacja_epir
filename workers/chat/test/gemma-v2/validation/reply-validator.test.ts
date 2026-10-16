/**
 * E5 reply validator — mutacje M-E5-14, M-E5-15, M-E5-16, M-E5-17, M-E5-18
 */
import {describe, expect, it} from 'vitest';
import {validateFormulationTextBeforeStitch} from '../../../src/gemma/validation/reply-validator';

const baseFacts = {
  allowedRefs: new Set(['g1']),
  allowedNumbers: new Set(['500']),
  kbAnswer: null as string | null,
  userText: 'fikcyjne',
  channelId: 'epir-online-store' as const,
};

describe('E5 reply validator', () => {
  it('T-E5-VAL-Q-1: question count on B text before stitch ignores stitched URLs', () => {
    const violations = validateFormulationTextBeforeStitch(
      'Proszę Pana/Panią — który wariant interesuje?',
      [],
      baseFacts,
    );
    expect(violations).not.toContain('too_many_questions');
  });

  it('T-E5-VAL-PHONE-1: spaced fictional phone fails without KB; ok when in KB answer', () => {
    const fail = validateFormulationTextBeforeStitch('Kontakt: 600 000 000', [], {
      ...baseFacts,
      kbAnswer: null,
    });
    expect(fail).toContain('phone_not_in_facts');

    const ok = validateFormulationTextBeforeStitch('Kontakt: 600 000 000', [], {
      ...baseFacts,
      kbAnswer: 'Infolinia: 600 000 000 w godzinach pracy.',
    });
    expect(ok).not.toContain('phone_not_in_facts');
  });

  it('T-E5-VAL-NUM-1: stray number without facts fails', () => {
    const v = validateFormulationTextBeforeStitch('Wysyłka w 14 dni roboczych.', [], baseFacts);
    expect(v).toContain('number_not_in_facts');
  });

  it('T-E5-VAL-FORM-1: standalone Pani fails gendered_address', () => {
    const v = validateFormulationTextBeforeStitch('Drodga Pani, zapraszam.', [], baseFacts);
    expect(v).toContain('gendered_address');
  });

  it('T-E5-VAL-BRAND-1: KAZKA mention fails on GE and GZ', () => {
    for (const channel of ['epir-online-store', 'epir-zareczyny'] as const) {
      const v = validateFormulationTextBeforeStitch('Zobacz kolekcję KAZKA.', [], {
        ...baseFacts,
        channelId: channel,
      });
      expect(v).toContain('brand_mix');
    }
  });

  it('T-E5-VAL-1: url in model text fails', () => {
    const v = validateFormulationTextBeforeStitch('Link: https://evil.example/x', [], baseFacts);
    expect(v).toContain('url_in_model_text');
  });

  it('T-E5-VAL-2: amount not in facts fails', () => {
    const v = validateFormulationTextBeforeStitch('Cena 9999 zł', [], baseFacts);
    expect(v).toContain('number_not_in_facts');
  });

  it('T-E5-VAL-3: informal ty fails', () => {
    const v = validateFormulationTextBeforeStitch('Polecam cię serdecznie', [], baseFacts);
    expect(v).toContain('informal_address');
  });

  it('T-E5-VAL-4: ref out of scope fails', () => {
    const v = validateFormulationTextBeforeStitch('{{g9}}', ['g9'], baseFacts);
    expect(v).toContain('ref_out_of_scope');
  });

  it('T-E5-VAL-PH-1: placeholders {{g1}} / {{g1.price}} are not numbers', () => {
    const v = validateFormulationTextBeforeStitch('Proszę Pana/Panią — polecam {{g1}} w cenie {{g1.price}}.', ['g1'], baseFacts);
    expect(v).toEqual([]);
  });

  it('T-E5-VAL-PRICE-1: amount in model text fails even when number is in userText', () => {
    const v = validateFormulationTextBeforeStitch('Tak, ten model kosztuje 100 zł.', [], {
      ...baseFacts,
      allowedNumbers: new Set(['100']),
      userText: 'czy jest coś za 100 zł?',
    });
    expect(v).toContain('price_in_model_text');
  });

  it('T-E5-VAL-FORM-2: pairs Panu/Pani ok; standalone Panią fails', () => {
    expect(validateFormulationTextBeforeStitch('Polecam Panu/Pani ten model.', [], baseFacts)).not.toContain('gendered_address');
    expect(validateFormulationTextBeforeStitch('Zapraszam Panią do salonu.', [], baseFacts)).toContain('gendered_address');
  });
});
