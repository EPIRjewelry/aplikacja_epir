/**
 * Klasyfikacja fraz / Search Themes pod kontrakt EPIR (blocklist + allowlist).
 */

export type ThemeClassification = 'allowlisted' | 'blocklisted' | 'neutral';

export type SearchTermBucket =
  | 'brand_ok'
  | 'intent_ok'
  | 'bargain_hunter'
  | 'competitor_noise'
  | 'low_ctr'
  | 'other';

export function normalizePhrase(text: string): string {
  return String(text || '')
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(/\p{M}/gu, '');
}

export function matchesAnyPattern(text: string, patterns: string[]): boolean {
  const n = normalizePhrase(text);
  if (!n) return false;
  return patterns.some((p) => n.includes(normalizePhrase(p)));
}

export function classifyThemeText(
  text: string,
  allowlistThemes: string[],
  blocklistPatterns: string[],
): ThemeClassification {
  const n = normalizePhrase(text);
  if (!n) return 'neutral';
  if (matchesAnyPattern(n, blocklistPatterns)) return 'blocklisted';
  for (const allowed of allowlistThemes) {
    if (normalizePhrase(allowed) === n) return 'allowlisted';
  }
  return 'neutral';
}

export type ThemeRow = {
  resourceName: string;
  assetGroupId: string;
  assetGroupName: string;
  text: string;
  approvalStatus?: string;
};

export type ThemeChangePlan = {
  assetGroupId: string;
  assetGroupName: string;
  remove: ThemeRow[];
  add: string[];
  keep: ThemeRow[];
  skippedAdd: string[];
};

export function planSearchThemeChanges(
  rows: ThemeRow[],
  allowlistThemes: string[],
  blocklistPatterns: string[],
  maxThemesPerAssetGroup: number,
  opts?: { pruneNonAllowlist?: boolean },
): ThemeChangePlan[] {
  const byAg = new Map<string, ThemeChangePlan>();
  const prune = opts?.pruneNonAllowlist === true;
  const allowNorm = new Set(allowlistThemes.map((t) => normalizePhrase(t)));

  for (const row of rows) {
    let plan = byAg.get(row.assetGroupId);
    if (!plan) {
      plan = {
        assetGroupId: row.assetGroupId,
        assetGroupName: row.assetGroupName,
        remove: [],
        add: [],
        keep: [],
        skippedAdd: [],
      };
      byAg.set(row.assetGroupId, plan);
    }
    const cls = classifyThemeText(row.text, allowlistThemes, blocklistPatterns);
    if (cls === 'blocklisted') {
      plan.remove.push(row);
      continue;
    }
    if (prune && !allowNorm.has(normalizePhrase(row.text))) {
      plan.remove.push(row);
      continue;
    }
    plan.keep.push(row);
  }

  for (const plan of byAg.values()) {
    const existingNorm = new Set(plan.keep.map((r) => normalizePhrase(r.text)));
    for (const allowed of allowlistThemes) {
      const norm = normalizePhrase(allowed);
      if (existingNorm.has(norm)) continue;
      const projected = plan.keep.length + plan.add.length;
      if (projected >= maxThemesPerAssetGroup) {
        plan.skippedAdd.push(allowed);
        continue;
      }
      plan.add.push(allowed);
      existingNorm.add(norm);
    }
  }

  return [...byAg.values()];
}

const BARGAIN_PATTERNS = [
  'promocj',
  'okazj',
  'tanio',
  'taniej',
  'outlet',
  'używan',
  'uzywan',
  'stare ',
  'stary ',
  'używane',
  'uzywane',
  'rabat',
  'wyprzeda',
  'komis',
  'second hand',
  '-50%',
];

const BRAND_PATTERNS = ['epir', 'epirbizuteria', 'epir bizuteria'];

export function classifySearchTerm(
  term: string,
  opts?: { ctr?: number; minCtr?: number },
): SearchTermBucket {
  const n = normalizePhrase(term);
  if (!n) return 'other';
  if (BRAND_PATTERNS.some((p) => n.includes(p))) return 'brand_ok';
  if (matchesAnyPattern(n, BARGAIN_PATTERNS)) return 'bargain_hunter';
  if (/maar\b|aliexpress|allegro używ|olx /.test(n)) return 'competitor_noise';
  const minCtr = opts?.minCtr ?? 0.01;
  if (opts?.ctr != null && opts.ctr > 0 && opts.ctr < minCtr) return 'low_ctr';
  if (
    /pierścionek|pierscionek|obrączk|obraczk|kolczyk|biżuteri|bizuteri|srebr|złot|zlot|turmalin|opal/.test(
      n,
    )
  ) {
    return 'intent_ok';
  }
  return 'other';
}
