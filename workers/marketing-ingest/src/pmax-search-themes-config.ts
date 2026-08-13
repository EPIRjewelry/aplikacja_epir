/**
 * Kontrakt Search Themes PMax (EPIR) — allowlist per asset group + wspólna blocklista.
 * Operator edytuje; AI egzekwuje przez pmax-search-themes.ts (dry-run domyślnie).
 */

export type SearchThemesContract = {
  campaignName: string;
  /** Tematy do utrzymania na asset group (brak → create). */
  allowlistThemes: string[];
  /** Podciągi (case-insensitive) — temat do usunięcia jeśli pasuje. */
  blocklistPatterns: string[];
  /** Maks. tematów allowlist per asset group (limit API ~25). */
  maxThemesPerAssetGroup: number;
  /**
   * Gdy true: usuń tematy spoza allowlisty (migracja dual→single metal / kuracja 48→N).
   * Gdy false: zostaw neutralne tematy, tylko blocklist + uzupełnij allowlist.
   */
  pruneNonAllowlist: boolean;
};

export const DEFAULT_PMAX_CAMPAIGN_FOR_THEMES = 'Epir_Forest-Dark';

export const SHARED_THEME_BLOCKLIST_PATTERNS: string[] = [
  'promocj',
  'okazj',
  'tanio',
  'taniej',
  'outlet',
  'używan',
  'uzywan',
  'używane',
  'uzywane',
  'stare pierścionki',
  'stary pierścionek',
  'brylanty używane',
  'diament używany',
  'second hand',
  'komis',
  'wyprzedaż',
  'wyprzedaz',
  'rabat',
  '-50%',
  'gratis',
  // szerokie / prezentowe / zaręczynowe — nie w Forest Srebro/Złoto
  'pierścionki na prezent',
  'ekskluzywna biżuteria',
  'unikatowy prezent',
  'prezent na okrągłe',
  'prezent świąteczny',
  'zaręczynowe',
  'zareczynowe',
  'biżuteria ślubna',
  'bizuteria slubna',
  'luksusowe rękodzieło',
  'luksusowe rekodzielo',
];

/** ~25 tematów srebrnych — artisan / las / kamienie. */
export const EPIR_SREBRO_ALLOWLIST: string[] = [
  'biżuteria handmade srebro',
  'organiczna biżuteria srebrna',
  'biżuteria ze srebra 925 artystyczna',
  'ręcznie kuta biżuteria srebrna',
  'oryginalne pierścionki ze srebra',
  'unikalne pierścionki srebrne',
  'pierścionek artystyczny srebro',
  'biżuteria artystyczna srebro',
  'srebrne pierścionki z kamieniami',
  'srebrne kolczyki z kamieniami',
  'kolczyki srebro artystyczne',
  'obrączki ręcznie robione srebro',
  'pierścionki z turmalinem',
  'biżuteria z turmalinem',
  'czarny turmalin biżuteria',
  'pierścionek z opalem artystyczny',
  'pierścionki z granatem',
  'pierścionki z ametystem',
  'pierścionki z cytrynem',
  'pierścionek z labradorytem',
  'pierścionki z naturalnymi kamieniami',
  'biżuteria z kamieniami naturalnymi',
  'biżuteria inspirowana lasem',
  'biżuteria z motywem roślinnym',
  'pierścionki gałązki',
];

/** ~22 tematów złotych — artisan / obrączki / kamienie. */
export const EPIR_ZLOTO_ALLOWLIST: string[] = [
  'złota biżuteria ręcznie robiona',
  'autorska biżuteria złota',
  'pierścionek złoty artystyczny',
  'złoty pierścionek artystyczny handmade',
  'pierścionek złoty ręcznie kuty',
  'obrączki złote ręcznie robione',
  'obrączka złota ręcznie robiona',
  'złote obrączki ręcznie kute',
  'złota obrączka artystyczna',
  'złoty pierścionek z opalem',
  'złote pierścionki z opalem',
  'złote kolczyki artystyczne',
  'kolczyki złote z kamieniami',
  'pierścionek żółte złoto moissanit',
  'pierścionek z żółtego złota artystyczny',
  'biżuteria złota z turmalinem',
  'pierścionek złoty z turmalinem',
  'złoty pierścionek z czarnym turmalinem',
  'biżuteria złota z kamieniami naturalnymi',
  'pierścionek złoty z granatem',
  'pierścionek złoty z ametystem',
  'biżuteria złota inspirowana lasem',
];

export const PMAX_SEARCH_THEMES_BY_ASSET_GROUP: Record<string, SearchThemesContract> = {
  EPIR_Srebro: {
    campaignName: DEFAULT_PMAX_CAMPAIGN_FOR_THEMES,
    allowlistThemes: EPIR_SREBRO_ALLOWLIST,
    blocklistPatterns: SHARED_THEME_BLOCKLIST_PATTERNS,
    maxThemesPerAssetGroup: 25,
    pruneNonAllowlist: true,
  },
  EPIR_Zloto: {
    campaignName: DEFAULT_PMAX_CAMPAIGN_FOR_THEMES,
    allowlistThemes: EPIR_ZLOTO_ALLOWLIST,
    blocklistPatterns: SHARED_THEME_BLOCKLIST_PATTERNS,
    maxThemesPerAssetGroup: 25,
    pruneNonAllowlist: true,
  },
};

/** Alias nazw AG przed rename w UI / podczas migracji. */
export const ASSET_GROUP_THEME_ALIASES: Record<string, keyof typeof PMAX_SEARCH_THEMES_BY_ASSET_GROUP> =
  {
    EPIR_Srebro: 'EPIR_Srebro',
    'Grupa plików 1': 'EPIR_Srebro',
    EPIR_Zloto: 'EPIR_Zloto',
  };

/**
 * Legacy flat contract (kompatybilność testów / audit bez --asset-group).
 * Preferuj resolveSearchThemesContract(assetGroupName).
 */
export const DEFAULT_PMAX_SEARCH_THEMES_CONTRACT: SearchThemesContract = {
  campaignName: DEFAULT_PMAX_CAMPAIGN_FOR_THEMES,
  allowlistThemes: [...EPIR_SREBRO_ALLOWLIST.slice(0, 10), ...EPIR_ZLOTO_ALLOWLIST.slice(0, 5)],
  blocklistPatterns: SHARED_THEME_BLOCKLIST_PATTERNS,
  maxThemesPerAssetGroup: 25,
  pruneNonAllowlist: false,
};

export function resolveSearchThemesContract(
  assetGroupName?: string | null,
): SearchThemesContract | { error: string } {
  const raw = String(assetGroupName ?? '').trim();
  if (!raw) {
    return {
      error:
        'assetGroupName required (EPIR_Srebro | EPIR_Zloto | Grupa plików 1). Walentynki: poza scope themes.',
    };
  }
  const aliasKey =
    ASSET_GROUP_THEME_ALIASES[raw] ??
    ASSET_GROUP_THEME_ALIASES[
      Object.keys(ASSET_GROUP_THEME_ALIASES).find((k) => k.toLowerCase() === raw.toLowerCase()) ??
        ''
    ];
  if (!aliasKey || !(aliasKey in PMAX_SEARCH_THEMES_BY_ASSET_GROUP)) {
    return {
      error: `brak kontraktu Search Themes dla asset group "${raw}" — oczekiwane: EPIR_Srebro, EPIR_Zloto (alias: Grupa plików 1)`,
    };
  }
  return PMAX_SEARCH_THEMES_BY_ASSET_GROUP[aliasKey];
}
