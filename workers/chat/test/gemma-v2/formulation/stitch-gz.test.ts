import {describe, expect, it} from 'vitest';
import {stitchFormulationReply} from '../../../src/gemma/formulation/stitch-reply';
import type {TurnFacts} from '../../../src/gemma/formulation/types';

describe('E5 formulation stitch GZ', () => {
  it('T-E5-FORM-2: stitch inserts url and price from turn facts', () => {
    const turn: TurnFacts = {
      channelId: 'epir-online-store',
      state: 'propozycje',
      allowedRefs: ['g1'],
      products: [{ref: 'g1', url: 'https://example.test/products/fikcyjny', priceDisplay: '2 000 zł', title: 'Fikcyjny', available: true}],
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
          title: 'Fikcyjny GZ',
          available: true,
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

  it('T-E5-DETAIL-1: szczegoly — ref i URL produktu ze szczegółów po productId, nie shown[0]', async () => {
    const {buildTurnFacts} = await import('../../../src/gemma/formulation/build-turn-facts');
    const {fictionalMultiVariantProduct} = await import('../fixtures/fictional-catalog-products');
    const detail = fictionalMultiVariantProduct();
    const turn = buildTurnFacts({
      channelId: 'epir-online-store',
      state: 'szczegoly',
      userText: 'pokaż drugi',
      outcome: {
        catalogCards: [],
        catalogFailed: false,
        productDetail: detail,
        kb: null,
        kbOutcome: 'ok',
        cart: null,
        selected: {productId: detail.productId, variantId: null},
        shown: [
          {ref: 'g1', productId: 'gid://shopify/Product/111', handle: 'inny', variantIds: [], url: 'https://example.test/products/inny'},
          {ref: 'g2', productId: detail.productId, handle: detail.handle, variantIds: [], url: detail.url},
        ],
      } as never,
    });
    expect(turn.products).toHaveLength(1);
    expect(turn.products[0].ref).toBe('g2');
    expect(turn.products[0].url).toBe(detail.url);
    expect(turn.products[0].title).toBe(detail.title);
    expect(turn.allowedUrls).not.toContain('https://example.test/products/inny');
  });
});
