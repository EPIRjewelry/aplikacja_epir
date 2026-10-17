import {catalogSnapshotChannel} from '../../buyer/channel-switch';
import type {BuyerChannelId} from '../../buyer/channel-switch';
import type {Env} from '../../config/bindings';
import {CatalogMcpSearchError} from '../../facts/catalog-mcp-error';
import {getCatalogRepository} from '../../facts';
import {filterProducts} from '../../facts/filter';
import type {ProductMatch} from '../../facts/types';
import {filterProductMatchesByZareczynyTag} from './assortment';
import type {GemmaCatalogSearchFilters} from './types';

export async function searchGemmaCatalog(
  env: Env,
  channelId: BuyerChannelId,
  filters: GemmaCatalogSearchFilters,
  limit: number,
  clientRequest?: Request,
): Promise<ProductMatch[]> {
  const started = Date.now();
  const catalogChannel = catalogSnapshotChannel(channelId);
  const repo = await getCatalogRepository(env, catalogChannel, {
    clientRequest,
    urlChannel: channelId,
    gemmaCatalogMcpErrors: true,
  });

  const {priceMin, priceMax, text, ucpIntent, metal, stone, ucpBrowseInStockAvailable, available} =
    filters;

  try {
    const {matches} = await repo.search(
      {
        text,
        ucpIntent,
        metal,
        stone,
        priceMin,
        priceMax,
        available,
        ucpBrowseInStockAvailable,
      },
      limit,
    );

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
