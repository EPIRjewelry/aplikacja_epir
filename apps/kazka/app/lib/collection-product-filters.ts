/**
 * URL → Storefront API ProductFilter[] + sort dla kolekcji Kazka (diamenty + złoto).
 *
 * Konwencja query:
 *   ?metal=zloto-zolte,zloto-biale
 *   &proba=14,18
 *   &ksztalt=Okrągły,Markiza
 *   &waga=0-0.2,0.2-0.5,0.5+
 *   &jakosc=D/VVS2,LAB
 *   &type=Naszyjnik
 *   &price_min=2000&price_max=6000
 *   &sort=price_asc|price_desc|newest
 *
 * Uwagi Storefront API:
 * - metal: taxonomyMetafield shopify / jewelry-material
 * - próba / jakość: variantOption (Search & Discovery)
 * - kształt: tag; waga: productMetafield custom.masa_bucket (single_line_text)
 * - legacy ?stone=… i metal=srebro są ignorowane
 */

export type CollectionProductFilter = {
  available?: boolean;
  price?: {min?: number; max?: number};
  productType?: string;
  tag?: string;
  productMetafield?: {namespace: string; key: string; value: string};
  taxonomyMetafield?: {namespace: string; key: string; value: string};
  variantOption?: {name: string; value: string};
};

export type CollectionSortKey =
  | 'COLLECTION_DEFAULT'
  | 'BEST_SELLING'
  | 'CREATED'
  | 'PRICE'
  | 'TITLE'
  | 'MANUAL'
  | 'ID';

export type CollectionSortParams = {
  sortKey: CollectionSortKey;
  reverse: boolean;
};

/** Slugi URL → wartości taxonomy `shopify.jewelry-material` (Search & Discovery). */
export const METAL_URL_TO_TAXONOMY: Record<string, string> = {
  'zloto-zolte': 'Yellow gold',
  'zloto-biale': 'White gold',
  'zloto-rozowe': 'Rose gold',
  Gold: 'Gold',
  'Yellow gold': 'Yellow gold',
  'White gold': 'White gold',
  'Rose gold': 'Rose gold',
};

export const METAL_FILTER_OPTIONS = [
  {value: 'zloto-zolte', label: 'Złoto żółte'},
  {value: 'zloto-biale', label: 'Złoto białe'},
  {value: 'zloto-rozowe', label: 'Złoto różowe'},
] as const;

/** URL slug → wartość opcji wariantu „Próba złota”. */
export const PROBA_URL_TO_OPTION: Record<string, string> = {
  '14': '14 karatów',
  '18': '18 karatów',
  '14-karatow': '14 karatów',
  '18-karatow': '18 karatów',
  '14 karatów': '14 karatów',
  '18 karatów': '18 karatów',
};

export const PROBA_FILTER_OPTIONS = [
  {value: '14', label: '14 karatów'},
  {value: '18', label: '18 karatów'},
] as const;

export const SHAPE_FILTER_OPTIONS = [
  {value: 'Okrągły', label: 'Okrągły'},
  {value: 'Księżniczka', label: 'Księżniczka'},
  {value: 'Markiza', label: 'Markiza'},
  {value: 'Bagietka', label: 'Bagietka'},
  {value: 'Serce', label: 'Serce'},
  {value: 'Gruszka', label: 'Gruszka'},
  {value: 'Owalny', label: 'Owalny'},
] as const;

/** URL bucket → custom.masa_bucket (backfill skryptem z Body „Masa kamieni”). */
export const WEIGHT_URL_TO_METAFIELD: Record<string, string> = {
  '0-0.2': '0-0.2g',
  '0.2-0.5': '0.2-0.5g',
  '0.5+': '0.5g+',
  '0-0.2g': '0-0.2g',
  '0.2-0.5g': '0.2-0.5g',
  '0.5g+': '0.5g+',
};

export const WEIGHT_FILTER_OPTIONS = [
  {value: '0-0.2', label: 'do 0,2 ct'},
  {value: '0.2-0.5', label: '0,2–0,5 ct'},
  {value: '0.5+', label: '0,5 ct i więcej'},
] as const;

/** URL → wartość opcji wariantu „Jakość” (LAB = laboratoryjny). */
export const QUALITY_URL_TO_OPTION: Record<string, string> = {
  'D/VVS2': 'D/VVS2',
  'F/VS2': 'F/VS2',
  'G/VS2': 'G/VS2',
  'G/SI': 'G/SI',
  LAB: 'LAB',
  laboratoryjny: 'LAB',
};

export const QUALITY_FILTER_OPTIONS = [
  {value: 'D/VVS2', label: 'D/VVS2'},
  {value: 'F/VS2', label: 'F/VS2'},
  {value: 'G/VS2', label: 'G/VS2'},
  {value: 'G/SI', label: 'G/SI'},
  {value: 'LAB', label: 'Laboratoryjny'},
] as const;

export const TYPE_FILTER_OPTIONS = [
  {value: 'Pierścionek', label: 'Pierścionek'},
  {value: 'Naszyjnik', label: 'Naszyjnik'},
  {value: 'Kolczyki', label: 'Kolczyki'},
  {value: 'Bransoletka', label: 'Bransoletka'},
] as const;

export const SORT_FILTER_OPTIONS = [
  {value: '', label: 'Domyślne'},
  {value: 'price_asc', label: 'Cena: rosnąco'},
  {value: 'price_desc', label: 'Cena: malejąco'},
  {value: 'newest', label: 'Najnowsze'},
] as const;

const VARIANT_OPTION_PROBA = 'Próba złota';
const VARIANT_OPTION_QUALITY = 'Jakość';

function splitParamValues(params: URLSearchParams, key: string): string[] {
  const raw = params.getAll(key);
  const values = raw
    .flatMap((v) => v.split(','))
    .map((v) => v.trim())
    .filter(Boolean);
  return [...new Set(values)];
}

function parseOptionalNumber(raw: string | null): number | undefined {
  if (raw == null || raw.trim() === '') return undefined;
  const n = Number(raw);
  if (!Number.isFinite(n) || n < 0) return undefined;
  return n;
}

export function parseCollectionSort(
  searchParams: URLSearchParams,
): CollectionSortParams {
  const sort = (searchParams.get('sort') ?? '').trim().toLowerCase();
  switch (sort) {
    case 'price_asc':
      return {sortKey: 'PRICE', reverse: false};
    case 'price_desc':
      return {sortKey: 'PRICE', reverse: true};
    case 'newest':
      return {sortKey: 'CREATED', reverse: true};
    default:
      return {sortKey: 'COLLECTION_DEFAULT', reverse: false};
  }
}

/**
 * Buduje listę ProductFilter dla Storefront API.
 * Wiele wartości tej samej osi → osobne obiekty (OR w Search & Discovery).
 * `metal=srebro` oraz legacy `stone` są pomijane.
 */
export function parseCollectionProductFilters(
  searchParams: URLSearchParams,
): CollectionProductFilter[] {
  const filters: CollectionProductFilter[] = [];

  for (const metal of splitParamValues(searchParams, 'metal')) {
    if (metal === 'srebro' || metal === 'Silver') continue;
    const value = METAL_URL_TO_TAXONOMY[metal];
    if (!value) continue;
    filters.push({
      taxonomyMetafield: {
        namespace: 'shopify',
        key: 'jewelry-material',
        value,
      },
    });
  }

  for (const proba of splitParamValues(searchParams, 'proba')) {
    const value = PROBA_URL_TO_OPTION[proba] ?? PROBA_URL_TO_OPTION[proba.toLowerCase()];
    if (!value) continue;
    filters.push({
      variantOption: {name: VARIANT_OPTION_PROBA, value},
    });
  }

  for (const shape of splitParamValues(searchParams, 'ksztalt')) {
    filters.push({tag: shape});
  }

  for (const weight of splitParamValues(searchParams, 'waga')) {
    const value = WEIGHT_URL_TO_METAFIELD[weight];
    if (!value) continue;
    filters.push({
      productMetafield: {
        namespace: 'custom',
        key: 'masa_bucket',
        value,
      },
    });
  }

  for (const quality of splitParamValues(searchParams, 'jakosc')) {
    const value =
      QUALITY_URL_TO_OPTION[quality] ??
      QUALITY_URL_TO_OPTION[quality.toLowerCase()];
    if (!value) continue;
    filters.push({
      variantOption: {name: VARIANT_OPTION_QUALITY, value},
    });
  }

  for (const type of splitParamValues(searchParams, 'type')) {
    filters.push({productType: type});
  }

  const min = parseOptionalNumber(searchParams.get('price_min'));
  const max = parseOptionalNumber(searchParams.get('price_max'));
  if (min !== undefined || max !== undefined) {
    filters.push({
      price: {
        ...(min !== undefined ? {min} : {}),
        ...(max !== undefined ? {max} : {}),
      },
    });
  }

  if (searchParams.get('available') === 'true') {
    filters.push({available: true});
  }

  return filters;
}

export function collectionHasActiveFilters(
  searchParams: URLSearchParams,
): boolean {
  return (
    parseCollectionProductFilters(searchParams).length > 0 ||
    Boolean((searchParams.get('sort') ?? '').trim())
  );
}
