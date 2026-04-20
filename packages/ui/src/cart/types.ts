import type {BaseCartLineConnection} from '@shopify/hydrogen-react/storefront-api-types';
import type {CartCost} from '@shopify/hydrogen/dist/storefront-api-types';

export type DeferredCart<TCart> = Promise<TCart | null> | TCart | null | undefined;

export type CartHeaderData = {
  totalQuantity?: number | null;
};

export type CartDrawerData = CartHeaderData & {
  lines: BaseCartLineConnection;
  cost: CartCost;
  checkoutUrl?: string | null;
};