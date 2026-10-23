import {describe, expect, it} from 'vitest';
import {
  EPIR_ONLINE_STORE_METAL_TAXONOMY_LABELS,
  expandBuyerMetalSlotToExactLabels,
  expandMetalSlotsForMatching,
  listErpMetalTaxonomyLabelsInBuyerMap,
  normalizeBuyerMetalTermKey,
} from '../../src/facts/metal-buyer-taxonomy';
import {
  productFactsMaterialMatchesTokens,
  variantMetalMatchesSlotTokens,
} from '../../src/facts/metal-match';
import {fictionalMultiVariantProduct} from '../gemma-v2/fixtures/fictional-catalog-products';

describe('metal-buyer-taxonomy — colloquial → exact labels', () => {
  it('T-METAL-BUYER-0: Polish ł/ó fold for map keys (NFD alone misses ł)', () => {
    expect(normalizeBuyerMetalTermKey('złoto')).toBe('zloto');
    expect(normalizeBuyerMetalTermKey('złoty')).toBe('zloty');
  });

  it('T-METAL-BUYER-1: złoto → solid gold taxonomy labels, not złocone', () => {
    const labels = expandBuyerMetalSlotToExactLabels('złoto');
    expect(labels).toContain(EPIR_ONLINE_STORE_METAL_TAXONOMY_LABELS.gold585);
    expect(labels).not.toContain('złocone');
    expect(variantMetalMatchesSlotTokens('złoto 585', ['złoto'])).toBe(true);
    expect(variantMetalMatchesSlotTokens('srebro pozłacane', ['złoto'])).toBe(false);
    expect(variantMetalMatchesSlotTokens('gold-plated', ['gold'])).toBe(false);
  });

  it('T-METAL-BUYER-2: 585 → złoto 585 only', () => {
    expect(expandBuyerMetalSlotToExactLabels('585')).toEqual([
      EPIR_ONLINE_STORE_METAL_TAXONOMY_LABELS.gold585,
    ]);
    expect(variantMetalMatchesSlotTokens('złoto 585', ['585'])).toBe(true);
    expect(variantMetalMatchesSlotTokens('złoto 333', ['585'])).toBe(false);
  });

  it('T-METAL-BUYER-3: srebrny → srebro 925 (+ bare srebro variant label)', () => {
    expect(expandBuyerMetalSlotToExactLabels('srebrny')).toEqual(
      expect.arrayContaining([
        EPIR_ONLINE_STORE_METAL_TAXONOMY_LABELS.silver925,
        'srebro',
      ]),
    );
    expect(variantMetalMatchesSlotTokens('srebro 925', ['srebrny'])).toBe(true);
    expect(variantMetalMatchesSlotTokens('srebro', ['srebro'])).toBe(true);
  });

  it('T-METAL-BUYER-4: exact SSOT label passthrough', () => {
    expect(expandMetalSlotsForMatching(['złoto 585'])).toEqual([
      EPIR_ONLINE_STORE_METAL_TAXONOMY_LABELS.gold585,
    ]);
  });

  it('T-METAL-BUYER-5: product fact srebro 925,złocone + slot złoto → no match', () => {
    const product = {
      ...fictionalMultiVariantProduct(),
      variants: [{...fictionalMultiVariantProduct().variants[0], metal: null}],
      metals: ['srebro 925, złocone'],
      metafields: {'custom.metal': 'srebro 925, złocone'},
    };
    expect(productFactsMaterialMatchesTokens(product, ['złoto'])).toBe(false);
    expect(productFactsMaterialMatchesTokens(product, ['srebro 925'])).toBe(true);
  });

  it('T-METAL-BUYER-6: map lists shop taxonomy labels', () => {
    expect(listErpMetalTaxonomyLabelsInBuyerMap()).toEqual(
      expect.arrayContaining([
        EPIR_ONLINE_STORE_METAL_TAXONOMY_LABELS.gold585,
        EPIR_ONLINE_STORE_METAL_TAXONOMY_LABELS.gold333,
        EPIR_ONLINE_STORE_METAL_TAXONOMY_LABELS.gold750,
        EPIR_ONLINE_STORE_METAL_TAXONOMY_LABELS.silver925,
      ]),
    );
  });
});
