import {
  LINIA_NAV_OPTIONS,
  KAT_NAV_OPTIONS,
} from './collection-product-filters';

export type VariantOptionPreference = {name: string; value: string};

/** Osobne smart kolekcje linii (zamiast ?linia=). */
export const LINIA_COLLECTION_HANDLES: Record<string, string> = {
  '': 'kazka',
  classic: 'kazka-classic',
  lab: 'kazka-big-lab',
  fancy: 'kazka-fancy-cut',
};

export function buildLiniaHref(linia: string): string {
  const handle = LINIA_COLLECTION_HANDLES[linia] ?? 'kazka';
  return `/collections/${handle}`;
}

/** Aktywna zakładka linii z pathname; null = brak (np. kategoria typu). */
export function activeLiniaFromPath(pathname: string): string | null {
  if (pathname.includes('kazka-classic')) return 'classic';
  if (pathname.includes('kazka-big-lab')) return 'lab';
  if (pathname.includes('kazka-fancy-cut')) return 'fancy';
  if (/\/collections\/kazka\/?$/.test(pathname)) return '';
  return null;
}

export function liniaFromCollectionHandle(handle: string): string {
  if (handle === 'kazka-classic') return 'classic';
  if (handle === 'kazka-big-lab') return 'lab';
  if (handle === 'kazka-fancy-cut') return 'fancy';
  return '';
}

const PAGINATION_KEYS = ['cursor', 'direction'] as const;

/** Usuwa parametry paginacji — zmiana filtra wraca na pierwszą stronę. */
export function stripPaginationParams(params: URLSearchParams): URLSearchParams {
  const next = new URLSearchParams(params);
  for (const key of PAGINATION_KEYS) {
    next.delete(key);
  }
  return next;
}

export function buildLiniaParams(
  current: URLSearchParams,
  linia: string,
): string {
  const next = stripPaginationParams(current);
  if (linia) {
    next.set('linia', linia);
  } else {
    next.delete('linia');
  }
  return next.toString();
}

export function buildKatParams(current: URLSearchParams, kat: string): string {
  const next = stripPaginationParams(current);
  if (kat) {
    next.set('kat', kat);
  } else {
    next.delete('kat');
  }
  return next.toString();
}

export function buildClearLiniaParams(current: URLSearchParams): string {
  const next = stripPaginationParams(current);
  next.delete('linia');
  return next.toString();
}

export function buildClearKatParams(current: URLSearchParams): string {
  const next = stripPaginationParams(current);
  next.delete('kat');
  return next.toString();
}

export function buildClearNavParams(current: URLSearchParams): string {
  const next = stripPaginationParams(current);
  next.delete('linia');
  next.delete('kat');
  return next.toString();
}

export function activeLiniaLabel(linia: string): string | undefined {
  return LINIA_NAV_OPTIONS.find((opt) => opt.value === linia)?.label;
}

export function activeKatLabel(kat: string): string | undefined {
  return KAT_NAV_OPTIONS.find((opt) => opt.value === kat)?.label;
}

/** Preferowany wariant LAB na karcie produktu (linia=lab). */
export function pickLabVariant<
  V extends {selectedOptions?: {name: string; value: string}[] | null},
>(variants: V[] | null | undefined): V | undefined {
  if (!variants?.length) return undefined;
  return variants.find((variant) =>
    variant.selectedOptions?.some(
      (option) => option.name === 'Jakość' && option.value === 'LAB',
    ),
  );
}

/** Opcje wariantu do pre-selekcji na karcie i w href PDP. */
export function preferVariantOptionsForLinia(
  linia: string,
): VariantOptionPreference[] | undefined {
  if (linia === 'lab') {
    return [{name: 'Jakość', value: 'LAB'}];
  }
  return undefined;
}
