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
 * Biała lista metapól Storefront/Admin.
 * Tylko `custom.gemstone_origin` jest potwierdzone; reszta po inwentaryzacji.
 */
export const STOREFRONT_METAFIELD_IDENTIFIERS = [
  {namespace: 'custom', key: 'gemstone_origin'},
  // do uzupełnienia po inwentaryzacji
] as const;

/** Namespace/key metapola pochodzenia na wariancie — do uzupełnienia po inwentaryzacji. */
export const VARIANT_ORIGIN_METAFIELD_KEYS: ReadonlyArray<{namespace: string; key: string}> = [
  // do uzupełnienia po inwentaryzacji
];
