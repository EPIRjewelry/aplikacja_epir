import {
  LINIA_NAV_OPTIONS,
  KAT_NAV_OPTIONS,
} from './collection-product-filters';

export type VariantOptionPreference = {name: string; value: string};

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

/**
 * Kanoniczny href kategorii w globalnym headerze.
 * Jedno miejsce: hub kolekcji + ?kat=… (zachowuje linia, czyści paginację i inne filtry listingowe).
 */
export function buildCategoryHref(
  hubPath: string,
  current: URLSearchParams,
  kat: string,
): string {
  const next = new URLSearchParams();
  const linia = current.get('linia')?.trim();
  if (linia) next.set('linia', linia);
  if (kat) next.set('kat', kat);
  const qs = next.toString();
  return qs ? `${hubPath}?${qs}` : hubPath;
}

/** Opcje kategorii w top barze — bez „Wszystkie typy”. */
export const HEADER_KAT_NAV_OPTIONS = KAT_NAV_OPTIONS.filter(
  (opt) => opt.value !== '',
);

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
