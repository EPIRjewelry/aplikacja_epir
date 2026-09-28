import type {ProductOption} from '@shopify/hydrogen/dist/storefront-api-types';

export type SelectedOption = {name: string; value: string};

const SIZE_OPTION_NAME_RE = /rozmiar/i;

export function findSizeOption(
  options: Pick<ProductOption, 'name' | 'values'>[],
): Pick<ProductOption, 'name' | 'values'> | undefined {
  return options.find((o) => SIZE_OPTION_NAME_RE.test(o.name));
}

export function productHasSizeOption(
  options: Pick<ProductOption, 'name' | 'values'>[],
): boolean {
  const sizeOpt = findSizeOption(options);
  return Boolean(sizeOpt && sizeOpt.values.length > 0);
}

export function isSizeMissingFromSearchParams(
  options: Pick<ProductOption, 'name' | 'values'>[],
  searchParams: URLSearchParams,
): boolean {
  const sizeOpt = findSizeOption(options);
  if (!sizeOpt) return false;
  const value = searchParams.get(sizeOpt.name);
  return !value?.trim();
}

export function allSizeValuesNumericRingScale(
  values: string[],
): boolean {
  if (!values.length) return false;
  return values.every((raw) => {
    const n = Number.parseInt(raw.trim(), 10);
    return Number.isFinite(n) && String(n) === raw.trim() && n >= 5 && n <= 35;
  });
}

export function formatSizeChipLabel(
  value: string,
  showMm: boolean,
): string {
  if (!showMm) return value;
  const n = Number.parseInt(value.trim(), 10);
  if (!Number.isFinite(n)) return value;
  return `${value} (${n + 40} mm)`;
}

export function variantMatchesSelectedOptions(
  selectedOptions: SelectedOption[],
  variantOptions: SelectedOption[] | null | undefined,
): boolean {
  if (!variantOptions?.length) return false;
  if (selectedOptions.length === 0) return false;
  return selectedOptions.every((sel) =>
    variantOptions.some((v) => v.name === sel.name && v.value === sel.value),
  );
}

export function buildSelectedOptionsFromSearchParams(
  searchParams: URLSearchParams,
): SelectedOption[] {
  const out: SelectedOption[] = [];
  searchParams.forEach((value, name) => {
    if (value.trim()) out.push({name, value});
  });
  return out;
}

export type MoneyLike = {amount: string; currencyCode: string};

export function formatMoneyPl(
  money: MoneyLike | null | undefined,
  opts?: {prefixFrom?: boolean},
): string | undefined {
  if (!money?.amount || !money.currencyCode) return undefined;
  const amount = Number(money.amount);
  if (!Number.isFinite(amount)) return undefined;
  const formatted = new Intl.NumberFormat('pl-PL', {
    style: 'currency',
    currency: money.currencyCode,
    maximumFractionDigits: 0,
  }).format(amount);
  if (opts?.prefixFrom) return `od ${formatted}`;
  return formatted;
}

export function formatProductTilePriceLabel(
  min: MoneyLike | null | undefined,
  max: MoneyLike | null | undefined,
): string | undefined {
  if (!min?.amount || !min.currencyCode) return undefined;
  const minN = Number(min.amount);
  const maxN = max?.amount ? Number(max.amount) : minN;
  if (!Number.isFinite(minN)) return undefined;
  const same =
    !max?.amount || !Number.isFinite(maxN) || minN === maxN;
  return formatMoneyPl(min, same ? undefined : {prefixFrom: true});
}

export function resolvePdpDisplayPrice(
  selectedVariant: {price?: MoneyLike | null} | null | undefined,
  priceRange: {
    minVariantPrice?: MoneyLike | null;
    maxVariantPrice?: MoneyLike | null;
  } | null | undefined,
  optionsComplete: boolean,
): {label: string; money?: MoneyLike} | null {
  if (optionsComplete && selectedVariant?.price?.amount) {
    const label = formatMoneyPl(selectedVariant.price);
    return label ? {label, money: selectedVariant.price} : null;
  }
  const min = priceRange?.minVariantPrice;
  const max = priceRange?.maxVariantPrice;
  if (!min?.amount) return null;
  const minN = Number(min.amount);
  const maxN = max?.amount ? Number(max.amount) : minN;
  const varies = Number.isFinite(maxN) && minN !== maxN;
  const label = formatMoneyPl(min, varies ? {prefixFrom: true} : undefined);
  return label ? {label, money: min} : null;
}

/** Nazwy opcji produktu bez wartości w URL, w kolejności Shopify. */
export function listMissingOptionNames(
  options: Pick<ProductOption, 'name' | 'values'>[],
  searchParams: URLSearchParams,
): string[] {
  const names: string[] = [];
  for (const option of options) {
    if (!option.values.length) continue;
    const val = searchParams.get(option.name);
    if (!val?.trim()) names.push(option.name);
  }
  return names;
}

/** Kolejna nazwa opcji do podpowiedzi na przycisku (cykl po brakujących). */
export function nextPromptOptionName(
  missing: string[],
  current: string | null,
): string | null {
  if (!missing.length) return null;
  if (!current) return missing[0];
  const idx = missing.indexOf(current);
  if (idx === -1) return missing[0];
  return missing[(idx + 1) % missing.length];
}

export function areRequiredOptionsSelected(
  options: Pick<ProductOption, 'name' | 'values'>[],
  searchParams: URLSearchParams,
): boolean {
  for (const option of options) {
    if (!option.values.length) continue;
    const val = searchParams.get(option.name);
    if (!val?.trim()) return false;
  }
  return true;
}

export function canAddToCart(
  options: Pick<ProductOption, 'name' | 'values'>[],
  searchParams: URLSearchParams,
  variantId: string | undefined,
): boolean {
  if (!variantId) return false;
  if (productHasSizeOption(options) && isSizeMissingFromSearchParams(options, searchParams)) {
    return false;
  }
  return areRequiredOptionsSelected(options, searchParams);
}

export function auditSizeOptionVsVariants(product: {
  options: Pick<ProductOption, 'name' | 'values'>[];
  variants?: {
    nodes?: Array<{selectedOptions?: SelectedOption[] | null}>;
  } | null;
}): string[] {
  const sizeOpt = findSizeOption(product.options);
  if (!sizeOpt) return [];
  const notes: string[] = [];
  const sizeName = sizeOpt.name;
  const variantSizes = new Set<string>();
  for (const node of product.variants?.nodes ?? []) {
    const match = node.selectedOptions?.find((o) => o.name === sizeName);
    if (match?.value) variantSizes.add(match.value);
  }
  for (const val of sizeOpt.values) {
    if (!variantSizes.has(val)) {
      notes.push(
        `Rozmiar „${val}” jest w opcji produktu, brak wariantu w pobranej liście (do 250).`,
      );
    }
  }
  if ((product.variants?.nodes?.length ?? 0) >= 250) {
    notes.push('Osiągnięto limit variants(first: 250) — możliwe ucięcie wariantów.');
  }
  return notes;
}
