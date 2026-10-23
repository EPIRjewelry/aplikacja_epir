import {describe, expect, it} from 'vitest';
import {formatBuyerCatalogLine, hasInternalRefMarkerLeak} from '../../../src/gemma/formulation/buyer-reply-format';
import {stitchFormulationReply} from '../../../src/gemma/formulation/stitch-reply';
import type {TurnFacts} from '../../../src/gemma/formulation/types';

const LIVE_LEAK_SAMPLE =
  'Proszę Pana/Panią, polecam następujące pierścionki: Pierścionek "Gałązki" z topazem Swiss Blue – 350,00 zł, Pierścionek z czarnym turmalinem z kolekcji "Gałązki" – 280,00 zł. Czy interesuje Pana/Panią konkretny kamień? g1: https://epirbizuteria.pl/products/pierscionek-galazki-z-topazem-swiss-blue 350,00 zł g2: https://epirbizuteria.pl/products/pierscionek-galazki-z-czarnym-turmalinem 280,00 zł';

describe('E5 buyer reply — no internal gN: markers', () => {
  it('T-E5-BUYER-LEAK-1: wyciek z internal (ea49333) wykrywa siatka bezpieczeństwa', () => {
    expect(hasInternalRefMarkerLeak(LIVE_LEAK_SAMPLE)).toBe(true);
  });

  it('T-E5-BUYER-LEAK-2: stitch nie dokleja linii „g1: url cena”', () => {
    const turn: TurnFacts = {
      channelId: 'epir-online-store',
      state: 'propozycje',
      allowedRefs: ['g1', 'g2'],
      products: [
        {
          ref: 'g1',
          url: 'https://epirbizuteria.pl/products/pierscionek-galazki-z-topazem-swiss-blue',
          priceDisplay: '350,00 zł',
          title: 'Pierścionek "Gałązki" z topazem Swiss Blue',
          available: true,
        },
        {
          ref: 'g2',
          url: 'https://epirbizuteria.pl/products/pierscionek-galazki-z-czarnym-turmalinem',
          priceDisplay: '280,00 zł',
          title: 'Pierścionek z czarnym turmalinem z kolekcji "Gałązki"',
          available: true,
        },
      ],
      kbAnswer: null,
      allowedUrls: [
        'https://epirbizuteria.pl/products/pierscionek-galazki-z-topazem-swiss-blue',
        'https://epirbizuteria.pl/products/pierscionek-galazki-z-czarnym-turmalinem',
      ],
      allowedNumbers: ['350', '280'],
    };
    const out = stitchFormulationReply(turn, {
      text: 'Proszę Pana/Panią, polecam następujące pierścionki.',
      product_refs: ['g1', 'g2'],
    });
    expect(hasInternalRefMarkerLeak(out)).toBe(false);
    expect(out).toContain('pierscionek-galazki-z-topazem-swiss-blue');
    expect(out).not.toMatch(/\bg1:\s*https?:/);
  });

  it('T-E5-BUYER-FMT-1: brak ceny — bez pustych nawiasów', () => {
    expect(
      formatBuyerCatalogLine({
        title: 'Fikcyjny pierścionek',
        url: 'https://example.test/products/x',
        priceDisplay: '',
      }),
    ).toBe('Fikcyjny pierścionek — https://example.test/products/x');
  });
});
