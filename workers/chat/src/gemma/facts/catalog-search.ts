import {catalogSnapshotChannel} from '../../buyer/channel-switch';
import type {BuyerChannelId} from '../../buyer/channel-switch';
import type {Env} from '../../config/bindings';
import {
  CatalogMcpLiveSearchError,
  CatalogMcpTransportEmptyError,
  getCatalogRepository,
} from '../../facts';
import {filterProducts} from '../../facts/filter';
import {
  fetchProductFactsByHandle,
  fetchProductFactsLive,
  hasStorefrontCatalogToken,
  searchStorefrontProductRefsByQuery,
} from '../../facts/storefront-live';
import {fetchShopSuggestProductHandles} from '../../facts/shop-suggest';
import {metalSlotsAreAssayScoped} from '../../facts/metal-buyer-taxonomy';
import {
  listProductTaxonomyMaterialLabels,
  productFactsMaterialMatchesTokens,
  variantMetalMatchesSlotTokens,
} from '../../facts/metal-match';
import {productFactsProductTypeMatchesSlots} from '../../facts/product-type-buyer-taxonomy';
import {
  productFactsStoneMatchesSlots,
  productHasStoneTaxonomyData,
} from '../../facts/stone-buyer-taxonomy';
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
    if (stoneTokens.length && productHasStoneTaxonomyData(match.product)) {
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
    let sfMergeNew = 0;
    let suggestMergeNew = 0;
    let suggestUpgraded = 0;

    const priceFilterActiveEarly = priceMin !== undefined || priceMax !== undefined;
    const queryText = text?.trim() ?? '';
    /** PT ∧ metal ∧ stone: doklej Storefront search(PRODUCT) — UCP ranking ≠ SF. */
    const facetedSearch =
      Boolean(metal?.length) &&
      Boolean(stone?.length) &&
      Boolean(productType?.length) &&
      Boolean(queryText);
    /** metal ∧ stone ∧ budget: Ajax/Predictive suggest + handle/.js upgrade (bez wymogu PT). */
    const suggestFacetedWithBudget =
      Boolean(metal?.length) &&
      Boolean(stone?.length) &&
      priceFilterActiveEarly &&
      Boolean(queryText);
    const storefrontLiveEnabled = hasStorefrontCatalogToken(env, catalogChannel);
    let sfRefsCount = 0;
    let suggestHandles: string[] = [];

    if (facetedSearch && queryText && storefrontLiveEnabled) {
      const sfRefs = await searchStorefrontProductRefsByQuery(
        env,
        catalogChannel,
        queryText,
        limit,
        {clientRequest, urlChannel: channelId},
      );
      sfRefsCount = sfRefs.length;
      const haveIds = new Set(
        matches.map((m) => m.product.productId).filter((id): id is string => Boolean(id)),
      );
      const need = sfRefs.filter((r) => !haveIds.has(r.id));
      if (need.length) {
        const handles: Record<string, string> = {};
        for (const r of need) {
          if (r.handle?.trim()) handles[r.id] = r.handle.trim();
        }
        const extraFacts = await fetchProductFactsLive(
          env,
          catalogChannel,
          need.map((r) => r.id),
          {clientRequest, urlChannel: channelId, productHandlesById: handles},
        );
        const extraMatches = filterProducts(extraFacts, {});
        sfMergeNew = extraMatches.length;
        matches = [...matches, ...extraMatches];
      }
    }

    if (suggestFacetedWithBudget && queryText && storefrontLiveEnabled) {
      const haveIds = new Set(
        matches.map((m) => m.product.productId).filter((id): id is string => Boolean(id)),
      );
      const haveHandles = new Set(
        matches.map((m) => m.product.handle?.trim()).filter((h): h is string => Boolean(h)),
      );
      suggestHandles = await fetchShopSuggestProductHandles(
        channelId,
        queryText,
        Math.min(limit, 10),
      );
      for (const handle of suggestHandles) {
        if (haveHandles.has(handle)) continue;
        const factsByHandle = await fetchProductFactsByHandle(env, catalogChannel, handle, {
          clientRequest,
          urlChannel: channelId,
        });
        if (!factsByHandle) continue;
        const extra = filterProducts([factsByHandle], {});
        if (!extra.length) continue;
        const pid = factsByHandle.productId;
        if (pid && haveIds.has(pid)) {
          matches = matches.map((m) => (m.product.productId === pid ? extra[0]! : m));
          suggestUpgraded += 1;
          haveHandles.add(handle);
          const resolvedHandle = factsByHandle.handle?.trim();
          if (resolvedHandle) haveHandles.add(resolvedHandle);
          continue;
        }
        suggestMergeNew += extra.length;
        matches = [...matches, ...extra];
        if (pid) haveIds.add(pid);
        haveHandles.add(handle);
      }
    }

    if (
      queryText &&
      storefrontLiveEnabled &&
      (facetedSearch || suggestFacetedWithBudget)
    ) {
      console.log(
        JSON.stringify({
          tag: 'gemma.catalog.stage',
          stage: facetedSearch ? 'sf_query_merge' : 'suggest_merge',
          ucp_matches: repoMatches.length,
          sf_refs: sfRefsCount,
          merged_new: sfMergeNew,
          suggest_handles: suggestHandles.length,
          suggest_merged_new: suggestMergeNew,
          suggest_upgraded: suggestUpgraded,
          after_merge: matches.length,
        }),
      );
    }

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
    const hydratedHandles = result
      .map((m) => m.product.handle)
      .filter((h): h is string => Boolean(h?.trim()))
      .slice(0, 24);

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
        sf_merge_new: sfMergeNew,
        suggest_merged_new: suggestMergeNew,
        suggest_upgraded: suggestUpgraded,
        hydrated_handles: hydratedHandles,
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
