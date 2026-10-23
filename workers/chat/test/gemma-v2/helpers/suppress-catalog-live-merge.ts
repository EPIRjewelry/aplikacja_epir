import {vi} from 'vitest';
import * as shopSuggest from '../../../src/facts/shop-suggest';
import * as storefrontLive from '../../../src/facts/storefront-live';

/**
 * Izolacja testów post-UCP na fixtureach repo — bez live suggest.json / SF search / product.js.
 */
export function suppressCatalogLiveMergeMocks() {
  vi.spyOn(shopSuggest, 'fetchShopSuggestProductHandles').mockResolvedValue([]);
  vi.spyOn(storefrontLive, 'searchStorefrontProductRefsByQuery').mockResolvedValue([]);
  vi.spyOn(storefrontLive, 'fetchProductFactsLive').mockResolvedValue([]);
}
