/**
 * Indeks wariantów z ProductFacts (katalog tej tury) — walidacja selected_options
 * przed mutacją koszyka. Storefront: ProductVariant.selectedOptions.
 * @see https://shopify.dev/docs/api/storefront/latest/objects/ProductVariant
 */
import type { ProductFacts, VariantFacts } from '../facts/types';
import { variantIdOf } from '../cart/ucp-cart';

export type SelectedOption = { name: string; value: string };

export type VariantOptionEntry = {
  productTitle: string;
  variantTitle: string;
  selectedOptions: SelectedOption[];
  optionValuesByName: Map<string, string[]>;
  requiresOptionChoice: boolean;
};

export type VariantOptionIndex = Map<string, VariantOptionEntry>;

export function createVariantOptionIndex(): VariantOptionIndex {
  return new Map();
}

function isDefaultTitleOnly(product: ProductFacts, variants: VariantFacts[]): boolean {
  if (variants.length <= 1) return true;
  const names = product.options?.map((o) => o.name.trim()) ?? [];
  if (names.length === 1 && names[0]?.toLowerCase() === 'title') {
    const values = product.options[0]?.values ?? [];
    if (values.length === 1 && values[0]?.trim() === 'Default Title') return true;
  }
  return false;
}

function requiresChoice(product: ProductFacts, variants: VariantFacts[]): boolean {
  if (variants.length <= 1) return false;
  if (isDefaultTitleOnly(product, variants)) return false;
  return (product.options?.length ?? 0) > 0;
}

export function mergeProductFactsIntoIndex(
  index: VariantOptionIndex,
  product: ProductFacts,
): void {
  const variants = product.variants ?? [];
  const optionValuesByName = new Map<string, string[]>();
  for (const opt of product.options ?? []) {
    const name = opt.name.trim();
    if (!name) continue;
    optionValuesByName.set(
      name,
      opt.values.map((v) => v.trim()).filter(Boolean),
    );
  }
  const needsChoice = requiresChoice(product, variants);
  const productTitle = product.title?.trim() || 'Produkt';

  for (const v of variants) {
    const vid = v.variantId?.trim();
    if (!vid) continue;
    index.set(vid, {
      productTitle,
      variantTitle: v.title?.trim() || '',
      selectedOptions: (v.selectedOptions ?? []).map((o) => ({
        name: o.name.trim(),
        value: o.value.trim(),
      })),
      optionValuesByName,
      requiresOptionChoice: needsChoice,
    });
  }
}

export function mergeCatalogMatchesIntoIndex(
  index: VariantOptionIndex,
  matches: Array<{ product: ProductFacts }>,
): void {
  for (const m of matches) {
    if (m?.product) mergeProductFactsIntoIndex(index, m.product);
  }
}

export type CartAddWithOptions = {
  variantId: string;
  selectedOptions: SelectedOption[] | null;
};

function parseSelectedOptions(raw: unknown): SelectedOption[] | null {
  if (!Array.isArray(raw)) return null;
  const out: SelectedOption[] = [];
  for (const row of raw) {
    if (!row || typeof row !== 'object') continue;
    const rec = row as Record<string, unknown>;
    const name = typeof rec.name === 'string' ? rec.name.trim() : '';
    const value = typeof rec.value === 'string' ? rec.value.trim() : '';
    if (name && value) out.push({ name, value });
  }
  return out.length ? out : null;
}

export function collectCartAddsWithOptions(
  toolName: string,
  args: Record<string, unknown>,
): CartAddWithOptions[] {
  const adds: CartAddWithOptions[] = [];
  const pushEntry = (entry: Record<string, unknown>) => {
    const vid = variantIdOf(entry);
    if (!vid) return;
    adds.push({
      variantId: vid,
      selectedOptions: parseSelectedOptions(entry.selected_options),
    });
  };

  if (toolName === 'create_cart' && Array.isArray(args.line_items)) {
    for (const row of args.line_items) {
      if (row && typeof row === 'object') pushEntry(row as Record<string, unknown>);
    }
  }
  if (toolName === 'update_cart' && Array.isArray(args.add_items)) {
    for (const row of args.add_items) {
      if (row && typeof row === 'object') pushEntry(row as Record<string, unknown>);
    }
  }
  return adds;
}

function normalizeOptKey(name: string): string {
  return name.trim().toLowerCase();
}

function optionsMatchVariant(
  entry: VariantOptionEntry,
  selected: SelectedOption[],
): boolean {
  for (const sel of selected) {
    const allowed = entry.optionValuesByName.get(sel.name) ?? [];
    const allowedNorm = new Set(allowed.map((v) => v.trim()));
    if (!allowedNorm.has(sel.value.trim())) return false;
    const variantOpt = entry.selectedOptions.find(
      (o) => normalizeOptKey(o.name) === normalizeOptKey(sel.name),
    );
    if (!variantOpt || variantOpt.value.trim() !== sel.value.trim()) return false;
  }
  return true;
}

export type OptionGateFailure =
  | {
      status: 'needs_option';
      missing_options: string[];
      available_values: Record<string, string[]>;
      variant_id: string;
    }
  | {
      status: 'option_mismatch';
      variant_id: string;
      selected_options: SelectedOption[];
      expected_options: SelectedOption[];
    };

export function validateCartAddsAgainstIndex(
  index: VariantOptionIndex,
  adds: CartAddWithOptions[],
): OptionGateFailure | null {
  for (const add of adds) {
    const entry = index.get(add.variantId);
    if (!entry) continue;
    if (!entry.requiresOptionChoice) continue;

    const missingNames = [...entry.optionValuesByName.keys()].filter((name) => {
      const vals = entry.optionValuesByName.get(name) ?? [];
      if (normalizeOptKey(name) === 'title' && vals.every((v) => v === 'Default Title')) {
        return false;
      }
      return true;
    });

    if (!add.selectedOptions?.length) {
      const available_values: Record<string, string[]> = {};
      for (const name of missingNames) {
        const vals = entry.optionValuesByName.get(name);
        if (vals?.length) available_values[name] = vals;
      }
      return {
        status: 'needs_option',
        missing_options: missingNames.length ? missingNames : ['Rozmiar'],
        available_values,
        variant_id: add.variantId,
      };
    }

    if (!optionsMatchVariant(entry, add.selectedOptions)) {
      return {
        status: 'option_mismatch',
        variant_id: add.variantId,
        selected_options: add.selectedOptions,
        expected_options: entry.selectedOptions,
      };
    }
  }
  return null;
}

export function stripSelectedOptionsFromCartArgs(
  args: Record<string, unknown>,
): Record<string, unknown> {
  const next = { ...args };
  const stripArray = (raw: unknown): unknown => {
    if (!Array.isArray(raw)) return raw;
    return raw.map((row) => {
      if (!row || typeof row !== 'object') return row;
      const copy = { ...(row as Record<string, unknown>) };
      delete copy.selected_options;
      return copy;
    });
  };
  if (Array.isArray(next.line_items)) {
    next.line_items = stripArray(next.line_items);
  }
  if (Array.isArray(next.add_items)) {
    next.add_items = stripArray(next.add_items);
  }
  return next;
}

export function lookupVariantDisplay(
  index: VariantOptionIndex,
  variantId: string,
): { title: string; optionsLine: string | null } | null {
  const entry = index.get(variantId);
  if (!entry) return null;
  const title = entry.productTitle || entry.variantTitle || '';
  const opts = entry.selectedOptions
    .filter((o) => o.value && o.value !== 'Default Title')
    .map((o) => `${o.name} ${o.value}`)
    .join(', ');
  return { title, optionsLine: opts || null };
}
