import { describe, expect, it } from 'vitest';
import {
  aggregatePmaxLandings,
  matchFreezeTargets,
  normalizeLandingUrl,
  FREEZE_LANDING_TARGETS,
} from './ads-pmax-landing-audit';

describe('normalizeLandingUrl', () => {
  it('strips query and fragment and trailing slash', () => {
    expect(
      normalizeLandingUrl(
        'https://epirbizuteria.pl/collections/zlota-bizuteria?utm_source=google#top',
      ),
    ).toBe('https://epirbizuteria.pl/collections/zlota-bizuteria');
    expect(normalizeLandingUrl('https://epirbizuteria.pl/collections/zlota-bizuteria/')).toBe(
      'https://epirbizuteria.pl/collections/zlota-bizuteria',
    );
  });

  it('strips PMax {ignore} placeholders', () => {
    expect(normalizeLandingUrl('https://epirbizuteria.pl{ignore}/')).toBe('https://epirbizuteria.pl/');
    expect(
      normalizeLandingUrl('https://epirbizuteria.pl/collections/pierscionki-obraczki%7Bignore%7D'),
    ).toBe('https://epirbizuteria.pl/collections/pierscionki-obraczki');
  });
});

describe('aggregatePmaxLandings', () => {
  it('groups by normalized URL and network with click share', () => {
    const rows = [
      {
        url: 'https://epirbizuteria.pl/collections/zlota-bizuteria?utm=1',
        network: 'SEARCH',
        clicks: 10,
        impressions: 100,
        costMicros: 1_000_000,
      },
      {
        url: 'https://epirbizuteria.pl/collections/zlota-bizuteria',
        network: 'YOUTUBE',
        clicks: 5,
        impressions: 50,
        costMicros: 500_000,
      },
      {
        url: 'https://epirbizuteria.pl/collections/pierscionki-obraczki',
        network: 'SEARCH',
        clicks: 5,
        impressions: 40,
        costMicros: 400_000,
      },
    ];

    const agg = aggregatePmaxLandings(rows);

    expect(agg.totals.clicks).toBe(20);
    expect(agg.byUrl).toHaveLength(2);
    expect(agg.byUrl[0]).toMatchObject({
      url: 'https://epirbizuteria.pl/collections/zlota-bizuteria',
      clicks: 15,
      clickSharePct: 75,
    });
    expect(agg.byNetwork).toHaveLength(2);
    expect(agg.byNetwork.find((n) => n.network === 'SEARCH')?.clicks).toBe(15);
    expect(agg.truncated).toBe(false);
  });

  it('flags truncated when row count hits limit', () => {
    const rows = Array.from({ length: 200 }, (_, i) => ({
      url: `https://epirbizuteria.pl/p/${i}`,
      network: 'SEARCH',
      clicks: 1,
      impressions: 1,
      costMicros: 0,
    }));
    expect(aggregatePmaxLandings(rows, 200).truncated).toBe(true);
  });
});

describe('matchFreezeTargets', () => {
  it('maps approved freeze URLs to click share', () => {
    const byUrl = [
      {
        url: 'https://epirbizuteria.pl/collections/zlota-bizuteria',
        clicks: 8,
        impressions: 80,
        costMicros: 800_000,
        clickSharePct: 80,
      },
      {
        url: 'https://epirbizuteria.pl/collections/pierscionki-obraczki',
        clicks: 2,
        impressions: 20,
        costMicros: 200_000,
        clickSharePct: 20,
      },
    ];

    const targets = matchFreezeTargets(byUrl, FREEZE_LANDING_TARGETS);
    const gold = targets.find((t) => t.key === 'FREEZE_GOLD_COLLECTION');
    const turmalin = targets.find((t) => t.key === 'FREEZE_PDP_TURMALIN');

    expect(gold).toMatchObject({ matched: true, clicks: 8, clickSharePct: 80 });
    expect(turmalin).toMatchObject({ matched: false, clicks: 0, clickSharePct: 0 });
  });

  it('matches collection paths with {ignore} suffix and subpaths', () => {
    const byUrl = [
      {
        url: 'https://epirbizuteria.pl/collections/pierscionki-obraczki%7Bignore%7D',
        clicks: 75,
        impressions: 680,
        costMicros: 4_549_198,
        clickSharePct: 75,
      },
      {
        url: 'https://epirbizuteria.pl/collections/pierscionki-obraczki/pier%C5%9Bcionek',
        clicks: 1,
        impressions: 61,
        costMicros: 2_877_903,
        clickSharePct: 1,
      },
    ];
    const silver = matchFreezeTargets(byUrl).find((t) => t.key === 'FREEZE_SILVER_COLLECTION');
    expect(silver).toMatchObject({ matched: true, clicks: 76 });
  });
});
