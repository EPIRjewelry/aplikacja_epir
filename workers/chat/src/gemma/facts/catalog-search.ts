import {catalogSnapshotChannel} from '../../buyer/channel-switch';
import type {BuyerChannelId} from '../../buyer/channel-switch';
import type {Env} from '../../config/bindings';
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
  const catalogChannel = catalogSnapshotChannel(channelId);
  const repo = await getCatalogRepository(env, catalogChannel, {
    clientRequest,
    urlChannel: channelId,
  });

  const {priceMin, priceMax, text, ucpIntent, metal, stone} = filters;
  const {matches} = await repo.search(
    {
      text,
      ucpIntent,
      metal,
      stone,
    },
    limit,
  );

  let out: ProductMatch[] = matches;
  if (priceMin !== undefined || priceMax !== undefined) {
    const products = matches.map((m) => m.product);
    out = filterProducts(products, {priceMin, priceMax});
  }

  return filterProductMatchesByZareczynyTag(env, channelId, out, clientRequest);
}
