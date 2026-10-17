import {catalogSnapshotChannel} from '../../buyer/channel-switch';
import type {BuyerChannelId} from '../../buyer/channel-switch';
import type {Env} from '../../config/bindings';
import {filterProducts} from '../../facts/filter';
import type {ProductMatch} from '../../facts/types';
import {
  GEMMA_CATALOG_DISPLAY_LIMIT,
  GEMMA_QUALITATIVE_CATALOG_FETCH_LIMIT,
} from '../actions/catalog-limits';
import {filterProductMatchesByZareczynyTag} from './assortment';
import {gemmaCatalogLiveSearch} from './catalog-live-search';
import {CatalogMcpSearchError} from './catalog-mcp-error';
import type {GemmaCatalogSearchFilters} from './types';

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
  const {priceMin, priceMax, text, ucpIntent, metal, stone, ucpBrowseInStockAvailable, available} =
    filters;

  const ucpFilters = {
    text,
    ucpIntent,
    metal,
    stone,
    available,
  };

  try {
    const {matches} = await gemmaCatalogLiveSearch(env, catalogChannel, ucpFilters, limit, {
      clientRequest,
      urlChannel: channelId,
      browseInStockAvailable: Boolean(ucpBrowseInStockAvailable),
    });

    let out: ProductMatch[] = matches;
    if (priceMin !== undefined || priceMax !== undefined) {
      const products = matches.map((m) => m.product);
      out = filterProducts(products, {metal, stone, priceMin, priceMax});
    }

    const result = await filterProductMatchesByZareczynyTag(env, channelId, out, clientRequest);

    console.log(
      JSON.stringify({
        tag: 'gemma.catalog',
        match_count: result.length,
        fetch_limit: limit,
        browse: Boolean(ucpBrowseInStockAvailable),
        has_text_query: Boolean(text?.trim()),
        duration_ms: Date.now() - started,
      }),
    );

    return result;
  } catch (e) {
    if (e instanceof CatalogMcpSearchError) {
      console.log(JSON.stringify({tag: 'gemma.catalog.error', code: e.mcpCode}));
    }
    throw e;
  }
}
