import {catalogSnapshotChannel} from '../../buyer/channel-switch';
import type {BuyerChannelId} from '../../buyer/channel-switch';
import type {Env} from '../../config/bindings';
import {
  CatalogMcpLiveSearchError,
  CatalogMcpTransportEmptyError,
  getCatalogRepository,
} from '../../facts';
import {filterProducts} from '../../facts/filter';
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

function variantMatchesMetalTokens(v: VariantFacts, metalTokens: string[]): boolean {
  if (!v.metal) return false;
  const vMetal = v.metal.trim().toLowerCase();
  return metalTokens.some((m) => vMetal.includes(m.toLowerCase()));
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

/**
 * SSOT: gdy slot metalu aktywny i warianty mają v.metal — produkt tylko przy metal ∧ budżet
 * na pełnym product.variants. Brak wypełnionego metalu → soft keep po cenie (NZ).
 */
function selectMatchesForMetalAndBudget(
  matches: ProductMatch[],
  opts: {
    metal: string[];
    priceMin?: MoneyPln | number;
    priceMax?: MoneyPln | number;
  },
): {matches: ProductMatch[]; metalFilterApplied: boolean} {
  const {metal: metalTokens, priceMin, priceMax} = opts;
  const priceActive = priceMin !== undefined || priceMax !== undefined;
  let metalFilterApplied = false;
  const next: ProductMatch[] = [];

  for (const match of matches) {
    const variants = match.product.variants;
    if (!hasAnyFilledMetal(variants)) {
      if (!priceActive) {
        next.push(match);
        continue;
      }
      const priced = filterProducts([match.product], {priceMin, priceMax});
      if (priced.length) next.push(priced[0]!);
      continue;
    }

    metalFilterApplied = true;
    const narrowed = variants.filter(
      (v) =>
        variantMatchesMetalTokens(v, metalTokens) &&
        variantMatchesPriceBounds(v, priceMin, priceMax),
    );
    if (!narrowed.length) continue;
    next.push(rebuildProductMatch(match.product, narrowed));
  }

  return {matches: next, metalFilterApplied};
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

    let out: ProductMatch[] = matches;
    const priceFilterActive = priceMin !== undefined || priceMax !== undefined;
    const metalSlotActive = Boolean(metal?.length);
    let metalFilterApplied = false;

    if (metalSlotActive && metal) {
      const selected = selectMatchesForMetalAndBudget(matches, {
        metal,
        priceMin,
        priceMax,
      });
      out = selected.matches;
      metalFilterApplied = selected.metalFilterApplied;
    } else if (priceFilterActive) {
      const products = matches.map((m) => m.product);
      out = filterProducts(products, {priceMin, priceMax});
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
        stone_filter_active: false,
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
