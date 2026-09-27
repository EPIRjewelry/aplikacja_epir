import type {Storefront} from '@shopify/hydrogen';
import type {AttributeInput, CartInput} from '@shopify/hydrogen/storefront-api-types';

/** Cart + order note attribute — SSOT for Hydrogen storefront on checkout. */
export const EPIR_STOREFRONT_CART_ATTR_KEY = '_epir_storefront';

export type EpirStorefrontCartValue = 'kazka' | 'zareczyny';

export function storefrontCartAttributeInput(
  value: EpirStorefrontCartValue,
): AttributeInput[] {
  return [{key: EPIR_STOREFRONT_CART_ATTR_KEY, value}];
}

export function withStorefrontCartInput(
  input: CartInput,
  value: EpirStorefrontCartValue,
): CartInput {
  const ours = storefrontCartAttributeInput(value)[0];
  const existing = input.attributes ?? [];
  const without = existing.filter((a) => a.key !== EPIR_STOREFRONT_CART_ATTR_KEY);
  return {
    ...input,
    attributes: [...without, ours],
  };
}

type AttrList = Array<{key?: string; value?: string | null}>;

export function readEpirStorefrontFromAttributes(
  attributes: AttrList | null | undefined,
): EpirStorefrontCartValue | null {
  for (const a of attributes ?? []) {
    if (a?.key === EPIR_STOREFRONT_CART_ATTR_KEY && a.value) {
      const v = a.value.trim();
      if (v === 'kazka' || v === 'zareczyny') return v;
    }
  }
  return null;
}

const CART_ATTRS_QUERY = `#graphql
  query EpirCartStorefrontAttr($cartId: ID!) {
    cart(id: $cartId) {
      attributes {
        key
        value
      }
    }
  }
`;

const CART_ATTRS_UPDATE = `#graphql
  mutation EpirCartStorefrontAttrUpdate($cartId: ID!, $attributes: [AttributeInput!]!) {
    cartAttributesUpdate(cartId: $cartId, attributes: $attributes) {
      cart {
        id
      }
      userErrors {
        message
        field
        code
      }
    }
  }
`;

/** Idempotent: set _epir_storefront when missing or wrong (legacy carts). */
export async function ensureStorefrontCartAttribute(
  storefront: Storefront,
  cartId: string,
  value: EpirStorefrontCartValue,
): Promise<void> {
  const data = await storefront.query<{
    cart: {attributes: AttrList} | null;
  }>(CART_ATTRS_QUERY, {
    variables: {cartId},
    cache: storefront.CacheNone(),
  });

  const current = readEpirStorefrontFromAttributes(data?.cart?.attributes);
  if (current === value) return;

  await storefront.mutate(CART_ATTRS_UPDATE, {
    variables: {
      cartId,
      attributes: storefrontCartAttributeInput(value),
    },
  });
}
