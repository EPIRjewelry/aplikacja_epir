import { describe, expect, it } from 'vitest';
import {
  HOMEPAGE_EXCLUSION_OPERATOR,
  HOMEPAGE_EXCLUSION_URLS,
  extractExcludedHomeUrlsFromCriterion,
  normalizeHomeUrlKey,
  planHomeExclusions,
} from './ads-exclude-home';

describe('normalizeHomeUrlKey', () => {
  it('treats trailing slash variants as same host root', () => {
    expect(normalizeHomeUrlKey('https://epirbizuteria.pl/')).toBe(
      normalizeHomeUrlKey('https://www.epirbizuteria.pl'),
    );
  });
});

describe('planHomeExclusions', () => {
  it('skips only exact URL arguments already on campaign', () => {
    const plan = planHomeExclusions({
      'Epir_Forest-Dark': ['https://epirbizuteria.pl/'],
      'Search-27.04.2026': [],
    });
    const pmax = plan.filter((p) => p.campaign === 'Epir_Forest-Dark');
    expect(pmax.some((p) => p.url === 'https://epirbizuteria.pl/')).toBe(false);
    expect(pmax.some((p) => p.url === 'https://epirbizuteria.pl')).toBe(true);
    expect(plan.filter((p) => p.campaign === 'Search-27.04.2026').length).toBe(8);
  });

  it('uses EQUALS operator constant only', () => {
    expect(HOMEPAGE_EXCLUSION_OPERATOR).toBe('EQUALS');
    expect(HOMEPAGE_EXCLUSION_URLS.length).toBe(8);
  });
});

describe('extractExcludedHomeUrlsFromCriterion', () => {
  it('reads URL EQUALS conditions', () => {
    const urls = extractExcludedHomeUrlsFromCriterion({
      campaignCriterion: {
        webpage: {
          conditions: [
            { operand: 'URL', operator: 'EQUALS', argument: 'https://epirbizuteria.pl/' },
            { operand: 'URL', operator: 'CONTAINS', argument: 'epir' },
          ],
        },
      },
    });
    expect(urls).toEqual(['https://epirbizuteria.pl/']);
  });
});
