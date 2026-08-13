import { describe, expect, it } from 'vitest';
import {
  classifySearchTerm,
  classifyThemeText,
  planSearchThemeChanges,
} from './ads-classify';
import {
  DEFAULT_PMAX_SEARCH_THEMES_CONTRACT,
  EPIR_SREBRO_ALLOWLIST,
  EPIR_ZLOTO_ALLOWLIST,
  PMAX_SEARCH_THEMES_BY_ASSET_GROUP,
  resolveSearchThemesContract,
  SHARED_THEME_BLOCKLIST_PATTERNS,
} from './pmax-search-themes-config';
import {
  buildSingleMetalListingCreateOps,
  parseMetalLabel,
  SILVER_LABEL,
  GOLD_LABEL,
} from './pmax-listing';

describe('classifyThemeText', () => {
  it('flags bargain patterns as blocklisted', () => {
    expect(
      classifyThemeText(
        'złote pierścionki promocje',
        DEFAULT_PMAX_SEARCH_THEMES_CONTRACT.allowlistThemes,
        DEFAULT_PMAX_SEARCH_THEMES_CONTRACT.blocklistPatterns,
      ),
    ).toBe('blocklisted');
  });

  it('recognizes exact allowlist theme', () => {
    expect(
      classifyThemeText(
        'pierścionki z turmalinem',
        EPIR_SREBRO_ALLOWLIST,
        SHARED_THEME_BLOCKLIST_PATTERNS,
      ),
    ).toBe('allowlisted');
  });

  it('flags gift/engagement themes via shared blocklist', () => {
    expect(
      classifyThemeText(
        'pierścionki zaręczynowe alternatywne',
        EPIR_SREBRO_ALLOWLIST,
        SHARED_THEME_BLOCKLIST_PATTERNS,
      ),
    ).toBe('blocklisted');
  });
});

describe('planSearchThemeChanges', () => {
  it('plans remove blocklisted and add missing allowlist', () => {
    const plans = planSearchThemeChanges(
      [
        {
          resourceName: 'customers/1/assetGroupSignals/1~1',
          assetGroupId: '1',
          assetGroupName: 'AG1',
          text: 'stare pierścionki z brylantami',
        },
        {
          resourceName: 'customers/1/assetGroupSignals/1~2',
          assetGroupId: '1',
          assetGroupName: 'AG1',
          text: 'pierścionki z turmalinem',
        },
      ],
      ['pierścionki z turmalinem', 'biżuteria handmade srebro'],
      DEFAULT_PMAX_SEARCH_THEMES_CONTRACT.blocklistPatterns,
      25,
    );
    expect(plans).toHaveLength(1);
    expect(plans[0].remove).toHaveLength(1);
    expect(plans[0].remove[0].text).toContain('stare');
    expect(plans[0].add).toContain('biżuteria handmade srebro');
  });

  it('prunes non-allowlist themes when pruneNonAllowlist=true', () => {
    const plans = planSearchThemeChanges(
      [
        {
          resourceName: 'customers/1/assetGroupSignals/1~1',
          assetGroupId: '1',
          assetGroupName: 'EPIR_Srebro',
          text: 'pierścionki z turmalinem',
        },
        {
          resourceName: 'customers/1/assetGroupSignals/1~2',
          assetGroupId: '1',
          assetGroupName: 'EPIR_Srebro',
          text: 'biżuteria boho luxe',
        },
      ],
      ['pierścionki z turmalinem', 'biżuteria handmade srebro'],
      SHARED_THEME_BLOCKLIST_PATTERNS,
      25,
      { pruneNonAllowlist: true },
    );
    expect(plans[0].remove.map((r) => r.text)).toContain('biżuteria boho luxe');
    expect(plans[0].keep.map((r) => r.text)).toContain('pierścionki z turmalinem');
    expect(plans[0].add).toContain('biżuteria handmade srebro');
  });
});

describe('resolveSearchThemesContract', () => {
  it('resolves EPIR_Srebro and Grupa plików 1 alias', () => {
    const a = resolveSearchThemesContract('EPIR_Srebro');
    const b = resolveSearchThemesContract('Grupa plików 1');
    expect('error' in a).toBe(false);
    expect('error' in b).toBe(false);
    if (!('error' in a) && !('error' in b)) {
      expect(a.allowlistThemes).toEqual(EPIR_SREBRO_ALLOWLIST);
      expect(b.allowlistThemes).toEqual(EPIR_SREBRO_ALLOWLIST);
      expect(a.pruneNonAllowlist).toBe(true);
    }
  });

  it('resolves EPIR_Zloto gold allowlist', () => {
    const c = resolveSearchThemesContract('EPIR_Zloto');
    expect('error' in c).toBe(false);
    if (!('error' in c)) {
      expect(c.allowlistThemes).toEqual(EPIR_ZLOTO_ALLOWLIST);
      expect(c.allowlistThemes.length).toBeLessThanOrEqual(25);
    }
  });

  it('rejects Walentynki (out of themes scope)', () => {
    const c = resolveSearchThemesContract('Walentynki');
    expect('error' in c).toBe(true);
  });

  it('keeps per-AG allowlists within API budget', () => {
    expect(PMAX_SEARCH_THEMES_BY_ASSET_GROUP.EPIR_Srebro.allowlistThemes.length).toBeLessThanOrEqual(
      25,
    );
    expect(PMAX_SEARCH_THEMES_BY_ASSET_GROUP.EPIR_Zloto.allowlistThemes.length).toBeLessThanOrEqual(
      25,
    );
    expect(EPIR_SREBRO_ALLOWLIST.length).toBe(25);
    expect(EPIR_ZLOTO_ALLOWLIST.length).toBe(22);
  });
});

describe('parseMetalLabel / buildSingleMetalListingCreateOps', () => {
  it('parses metal labels', () => {
    expect(parseMetalLabel('Srebro')).toBe(SILVER_LABEL);
    expect(parseMetalLabel('zloto')).toBe(GOLD_LABEL);
    expect(parseMetalLabel('gold')).toBeNull();
  });

  it('builds single-metal tree with one INCLUDE', () => {
    const ops = buildSingleMetalListingCreateOps('1', '99', SILVER_LABEL);
    const creates = ops.map((o) => (o as { create: { type: string; caseValue?: unknown } }).create);
    const included = creates.filter((c) => c.type === 'UNIT_INCLUDED');
    expect(included).toHaveLength(1);
    expect(JSON.stringify(included[0])).toContain('Srebro');
    expect(creates.some((c) => c.type === 'UNIT_EXCLUDED')).toBe(true);
  });
});

describe('classifySearchTerm', () => {
  it('classifies bargain hunters', () => {
    expect(classifySearchTerm('złote pierścionki promocje')).toBe('bargain_hunter');
  });

  it('classifies low ctr jewelry intent', () => {
    expect(classifySearchTerm('czarny turmalin pierścionek', { ctr: 0.005 })).toBe(
      'low_ctr',
    );
  });
});
