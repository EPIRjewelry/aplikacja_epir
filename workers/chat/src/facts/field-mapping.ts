/**
 * Mapowanie nazw opcji wariantów na semantyczne pola.
 * Źródło: inwentaryzacja opcji w katalogu (do uzupełnienia po inwentaryzacji).
 * Porównanie: lowercase, trimmed.
 */

const SIZE_OPTION_NAMES = new Set([
  'rozmiar',
  'size',
  'wielkość',
  'wielkosc',
]);

const METAL_OPTION_NAMES = new Set([
  'metal',
  'materiał',
  'material',
  'złoto',
  'zloto',
]);

const QUALITY_OPTION_NAMES = new Set([
  'jakość kamienia',
  'jakosc kamienia',
  'jakość',
  'jakosc',
  'quality',
  'diamond',
  'brylant',
  'kamień',
  'kamien',
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
 * Whitelist metapól do odczytu przez Storefront API.
 * Do uzupełnienia po inwentaryzacji metafieldDefinitions.
 */
export const STOREFRONT_METAFIELD_IDENTIFIERS = [
  { namespace: 'custom', key: 'gemstone_origin' },
  { namespace: 'custom', key: 'main_stone' },
  { namespace: 'custom', key: 'gemstone_type' },
] as const;
