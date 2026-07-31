import type {Storefront} from '@shopify/hydrogen';

function isFullCartPayload(cart: unknown): boolean {
  return (
    cart != null &&
    typeof cart === 'object' &&
    'lines' in cart &&
    'cost' in cart
  );
}

/**
 * Po mutacji koszyka Shopify czasem zwraca stub — kilka prób CART_QUERY
 * zanim szuflada / Layout dostaną lines + cost (wymagane przez fetcher ADD_TO_CART).
 */
export async function queryFullCartAfterMutation<TCart>(
  storefront: Storefront,
  cartId: string,
  cartQuery: string,
  maxAttempts = 3,
): Promise<TCart | null> {
  const variables = {
    cartId,
    country: storefront.i18n.country,
    language: storefront.i18n.language,
  };

  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    const {cart} = await storefront.query<{cart: unknown}>(cartQuery, {
      variables,
      cache: storefront.CacheNone(),
    });
    if (isFullCartPayload(cart)) {
      return cart as TCart;
    }
    if (attempt < maxAttempts - 1) {
      await new Promise((resolve) => setTimeout(resolve, 120 * (attempt + 1)));
    }
  }

  return null;
}
