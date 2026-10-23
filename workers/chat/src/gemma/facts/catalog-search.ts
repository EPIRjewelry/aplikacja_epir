import {catalogSnapshotChannel} from '../../buyer/channel-switch';
import type {BuyerChannelId} from '../../buyer/channel-switch';
import type {Env} from '../../config/bindings';
import {
  CatalogMcpLiveSearchError,
  CatalogMcpTransportEmptyError,
  getCatalogRepository,
} from '../../facts';
import {filterProducts} from '../../facts/filter';
import {metalSlotsAreAssayScoped} from '../../facts/metal-buyer-taxonomy';
import {
  listProductTaxonomyMaterialLabels,
  productFactsMaterialMatchesTokens,
  variantMetalMatchesSlotTokens,
} from '../../facts/metal-match';
import {productFactsProductTypeMatchesSlots} from '../../facts/product-type-buyer-taxonomy';
import {productFactsStoneMatchesSlots} from '../../facts/stone-buyer-taxonomy';
import {moneyFromMinor} from '../../facts/types';
import type {MoneyPln, ProductFacts, ProductMatch, VariantFacts} from '../../facts/types';
import {filterProductMatchesByZareczynyTag} from './assortment';
import {CatalogMcpSearchError} from './catalog-mcp-error';
import {filterOutGiftCardMatches} from './gift-card-catalog';
import type {GemmaCatalogSearchFilters} from './types';

function rebuildProductMatch(product: ProductFacts, matching: VariantFacts[]): ProductMatch {
  const prices = matching.map((v) => v.price.minor ?? v.price.amount_minor ?? 0);
  const minM = Math.min(...prices);
  const maxM = Math.max(...prices);
  const isFlat = minM === maxM;
  return {
    product,
    matchingVariants: matching,
    matchingVariantIds: matching.map((v) => v.variantId || v.variant_id || ''),
    matchingPriceRange: {
      min: moneyFromMinor(minM),
      max: moneyFromMinor(maxM),
      isFlat,
    },
    isFlat,
  };
}

function priceMinorOf(v: MoneyPln | number | undefined): number | undefined {
  if (v === undefined) return undefined;
  if (typeof v === 'number') return v;
  return v.minor ?? v.amount_minor;
}

function variantPriceMinor(v: VariantFacts): number {
  return v.price?.minor ?? v.price?.amount_minor ?? 0;
}

function variantMatchesPriceBounds(
  v: VariantFacts,
  priceMin: MoneyPln | number | undefined,
  priceMax: MoneyPln | number | undefined,
): boolean {
  const min = priceMinorOf(priceMin);
  const max = priceMinorOf(priceMax);
  if (min === undefined && max === undefined) return true;
  const p = v.price?.minor ?? v.price?.amount_minor;
  if (p === undefined) return false;
  if (min !== undefined && p < min) return false;
  if (max !== undefined && p > max) return false;
  return true;
}

function hasAnyFilledMetal(variants: VariantFacts[]): boolean {
  return variants.some((v) => Boolean(v.metal?.trim()));
}

function hasProductMaterialFact(product: ProductFacts): boolean {
  return listProductTaxonomyMaterialLabels(product).length > 0;
}

function keepMatchAfterPriceOnly(
  match: ProductMatch,
  priceMin: MoneyPln | number | undefined,
  priceMax: MoneyPln | number | undefined,
  priceActive: boolean,
): ProductMatch | null {
  if (!priceActive) return match;
  const priced = filterProducts([match.product], {priceMin, priceMax});
  return priced[0] ?? null;
}

/** Próba 585/333/750 — jedna cena wariantu (najtańszy w budżecie), nie widełki rozmiarów. */
function collapseAssayScopedMatch(match: ProductMatch, metalSlots: string[]): ProductMatch {
  if (!metalSlotsAreAssayScoped(metalSlots)) return match;
  const variants = match.matchingVariants;
  if (variants.length <= 1) return match;
  const cheapest = variants.reduce((best, v) =>
    variantPriceMinor(v) < variantPriceMinor(best) ? v : best,
  );
  return rebuildProductMatch(match.product, [cheapest]);
}

/**
 * Post-UCP Gemma: exact productType + stone (taxonomy labels), metal ∧ twardy budżet.
 */
function selectMatchesForGemmaPostUcp(
  matches: ProductMatch[],
  opts: {
    metal?: string[];
    productType?: string[];
    stone?: string[];
    priceMin?: MoneyPln | number;
    priceMax?: MoneyPln | number;
  },
): {
  matches: ProductMatch[];
  metalFilterApplied: boolean;
  stoneFilterApplied: boolean;
  productTypeFilterApplied: boolean;
} {
  const metalTokens = opts.metal ?? [];
  const productTypeTokens = opts.productType ?? [];
  const stoneTokens = opts.stone ?? [];
  const {priceMin, priceMax} = opts;
  const priceActive = priceMin !== undefined || priceMax !== undefined;
  const metalActive = metalTokens.length > 0;
  let metalFilterApplied = false;
  let stoneFilterApplied = false;
  let productTypeFilterApplied = false;
  const next: ProductMatch[] = [];

  for (const match of matches) {
    if (productTypeTokens.length) {
      productTypeFilterApplied = true;
      if (!productFactsProductTypeMatchesSlots(match.product.productType, productTypeTokens)) {
        continue;
      }
    }
    if (stoneTokens.length) {
      stoneFilterApplied = true;
      if (!productFactsStoneMatchesSlots(match.product, stoneTokens)) continue;
    }

    const variants = match.product.variants;
    if (metalActive) {
      if (hasAnyFilledMetal(variants)) {
        metalFilterApplied = true;
        const narrowed = variants.filter(
          (v) =>
            variantMetalMatchesSlotTokens(v.metal, metalTokens) &&
            variantMatchesPriceBounds(v, priceMin, priceMax),
        );
        if (!narrowed.length) continue;
        next.push(collapseAssayScopedMatch(rebuildProductMatch(match.product, narrowed), metalTokens));
        continue;
      }

      if (hasProductMaterialFact(match.product)) {
        metalFilterApplied = true;
        if (!productFactsMaterialMatchesTokens(match.product, metalTokens)) continue;
        const kept = keepMatchAfterPriceOnly(match, priceMin, priceMax, priceActive);
        if (kept) next.push(collapseAssayScopedMatch(kept, metalTokens));
        continue;
      }

      const kept = keepMatchAfterPriceOnly(match, priceMin, priceMax, priceActive);
      if (kept) next.push(collapseAssayScopedMatch(kept, metalTokens));
      continue;
    }

    if (priceActive) {
      const priced = filterProducts([match.product], {priceMin, priceMax});
      if (priced[0]) next.push(priced[0]);
      continue;
    }

    next.push(match);
  }

  return {matches: next, metalFilterApplied, stoneFilterApplied, productTypeFilterApplied};
}

export type GemmaCatalogPricedMatch = {match: ProductMatch; minMinor: number};

export async function searchGemmaCatalog(
  env: Env,
  channelId: BuyerChannelId,
  filters: GemmaCatalogSearchFilters,
  limit: number,
  clientRequest?: Request,
): Promise<ProductMatch[]> {
  const started = Date.now();
  const catalogChannel = catalogSnapshotChannel(channelId);
  const {
    priceMin,
    priceMax,
    text,
    ucpIntent,
    metal,
    stone,
    productType,
    ucpBrowseInStockAvailable,
    available,
    excludeGiftCards,
  } = filters;

  const ucpFilters = {
    text,
    ucpIntent,
    available,
    priceMin,
    priceMax,
  };

  try {
    const repo = await getCatalogRepository(env, catalogChannel, {
      clientRequest,
      urlChannel: channelId,
      throwOnMcpError: true,
      browseInStockAvailable: Boolean(ucpBrowseInStockAvailable),
    });
    const {matches: repoMatches} = await repo.search(ucpFilters, limit);
    let matches = repoMatches;

    if (excludeGiftCards) {
      matches = filterOutGiftCardMatches(matches);
    }

    const priceFilterActive = priceMin !== undefined || priceMax !== undefined;
    const localPostUcpActive =
      Boolean(metal?.length) ||
      Boolean(stone?.length) ||
      Boolean(productType?.length) ||
      priceFilterActive;

    let out: ProductMatch[] = matches;
    let metalFilterApplied = false;
    let stoneFilterApplied = false;
    let productTypeFilterApplied = false;

    if (localPostUcpActive) {
      const selected = selectMatchesForGemmaPostUcp(matches, {
        metal,
        stone,
        productType,
        priceMin,
        priceMax,
      });
      out = selected.matches;
      metalFilterApplied = selected.metalFilterApplied;
      stoneFilterApplied = selected.stoneFilterApplied;
      productTypeFilterApplied = selected.productTypeFilterApplied;
    }

    const afterPrice = out.length;
    const result = await filterProductMatchesByZareczynyTag(env, channelId, out, clientRequest);

    console.log(
      JSON.stringify({
        tag: 'gemma.catalog',
        match_count: result.length,
        fetch_limit: limit,
        browse: Boolean(ucpBrowseInStockAvailable),
        has_text_query: Boolean(text?.trim()),
        after_gift_card: matches.length,
        after_price: afterPrice,
        price_filter_active: priceFilterActive,
        metal_filter_active: metalFilterApplied,
        stone_filter_active: stoneFilterApplied,
        product_type_filter_active: productTypeFilterApplied,
        duration_ms: Date.now() - started,
      }),
    );

    return result;
  } catch (e) {
    if (e instanceof CatalogMcpTransportEmptyError) {
      console.log(JSON.stringify({tag: 'gemma.catalog.error', code: 'transport_empty'}));
      throw e;
    }
    if (e instanceof CatalogMcpLiveSearchError) {
      console.log(JSON.stringify({tag: 'gemma.catalog.error', code: e.mcpCode}));
      throw new CatalogMcpSearchError(e.mcpCode);
    }
    if (e instanceof CatalogMcpSearchError) {
      console.log(JSON.stringify({tag: 'gemma.catalog.error', code: e.mcpCode}));
    }
    throw e;
  }
}
