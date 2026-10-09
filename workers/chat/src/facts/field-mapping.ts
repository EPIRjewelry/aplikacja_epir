/**
 * Mapowanie nazw opcji wariantów — tylko potwierdzone nazwy.
 * Reszta: do uzupełnienia po inwentaryzacji (`scripts/facts-inventory.mjs`).
 */

const SIZE_OPTION_NAMES = new Set([
  'rozmiar',
  'size',
  // do uzupełnienia po inwentaryzacji
]);

const METAL_OPTION_NAMES = new Set([
  'metal',
  'materiał',
  'material',
  // do uzupełnienia po inwentaryzacji
]);

/** Potwierdzona nazwa opcji jakości kamienia (KAZKA). */
const QUALITY_OPTION_NAMES = new Set([
  'jakość',
  'jakosc',
  // do uzupełnienia po inwentaryzacji (np. pełna „Jakość kamienia”)
]);

export function isSizeOption(name: string): boolean {
  return SIZE_OPTION_NAMES.has(name.trim().toLowerCase());
}

export function isMetalOption(name: string): boolean {
  return METAL_OPTION_NAMES.has(name.trim().toLowerCase());
}

export function isQualityOption(name: string): boolean {
  return QUALITY_OPTION_NAMES.has(name.trim().toLowerCase());
}

/**
 * Biała lista metapól produktu (Storefront) — potwierdzone przez właściciela.
 * Referencje metaobiektów (`shopify.*`, `stone_education`) mają osobną selekcję GraphQL w storefront-live.
 */
export const STOREFRONT_METAFIELD_IDENTIFIERS = [
  {namespace: 'custom', key: 'main_stone'},
  {namespace: 'custom', key: 'metal'},
  {namespace: 'custom', key: 'gemstone_origin'},
  {namespace: 'shopify', key: 'gemstone-type'},
  {namespace: 'shopify', key: 'jewelry-material'},
  {namespace: 'custom', key: 'stone_education'},
] as const;

/** Metapola wariantu (poziom wariantu — pierwszeństwo nad produktem dla pochodzenia). */
export const VARIANT_ORIGIN_METAFIELD_KEYS: ReadonlyArray<{namespace: string; key: string}> = [
  {namespace: 'custom', key: 'gemstone_origin'},
];

/** Dodatkowe metapola wariantu (nie pochodzenie). */
export const VARIANT_METAFIELD_IDENTIFIERS = [
  {namespace: 'custom', key: 'gemstone_type'},
  {namespace: 'custom', key: 'gemstone_origin'},
  {namespace: 'custom', key: 'gemstone_carat_weight'},
] as const;
