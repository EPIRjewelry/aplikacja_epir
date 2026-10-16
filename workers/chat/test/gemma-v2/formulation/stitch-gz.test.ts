import {describe, expect, it} from 'vitest';
import {stitchFormulationReply} from '../../../src/gemma/formulation/stitch-reply';
import type {TurnFacts} from '../../../src/gemma/formulation/types';

describe('E5 formulation stitch GZ', () => {
  it('T-E5-FORM-2: stitch inserts url and price from turn facts', () => {
    const turn: TurnFacts = {
      channelId: 'epir-online-store',
      state: 'propozycje',
      allowedRefs: ['g1'],
      products: [{ref: 'g1', url: 'https://example.test/products/fikcyjny', priceDisplay: '2 000 zł'}],
      kbAnswer: null,
      allowedUrls: ['https://example.test/products/fikcyjny'],
      allowedNumbers: ['2000'],
    };
    const out = stitchFormulationReply(turn, {
      text: 'Proszę Pana/Panią — {{g1}} ({{g1.price}}).',
      product_refs: ['g1'],
    });
    expect(out).toContain('https://example.test/products/fikcyjny');
    expect(out).toContain('2 000 zł');
  });

  it('T-E5-GZ-1: stitch on epir-zareczyny uses only shown GZ url', () => {
    const turn: TurnFacts = {
      channelId: 'epir-zareczyny',
      state: 'propozycje',
      allowedRefs: ['g1'],
      products: [
        {
          ref: 'g1',
          url: 'https://zareczyny.example.test/products/fikcyjny-gz',
          priceDisplay: '1 500 zł',
        },
      ],
      kbAnswer: null,
      allowedUrls: ['https://zareczyny.example.test/products/fikcyjny-gz'],
      allowedNumbers: ['1500'],
    };
    const out = stitchFormulationReply(turn, {
      text: 'Proszę Pana/Panią — {{g1}} za {{g1.price}}.',
      product_refs: ['g1'],
    });
    expect(out).toContain('https://zareczyny.example.test/products/fikcyjny-gz');
    expect(out).not.toContain('epirbizuteria.pl');
  });
});
