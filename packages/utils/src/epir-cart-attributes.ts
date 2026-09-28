import type {Storefront} from '@shopify/hydrogen';
import type {AttributeInput, CartInput} from '@shopify/hydrogen/storefront-api-types';

/** Cart + order note attribute — SSOT for Hydrogen storefront on checkout. */
export const EPIR_STOREFRONT_CART_ATTR_KEY = '_epir_storefront';

/** Ten sam identyfikator co Web Pixel (`_epir_session_id` cookie). */
export const EPIR_SESSION_CART_ATTR_KEY = '_epir_session_id';

export type EpirStorefrontCartValue = 'kazka' | 'zareczyny';

export function storefrontCartAttributeInput(
  value: EpirStorefrontCartValue,
): AttributeInput[] {
  return [{key: EPIR_STOREFRONT_CART_ATTR_KEY, value}];
}

export function sessionCartAttributeInput(sessionId: string): AttributeInput[] {
  const v = sessionId.trim();
  if (!v) return [];
  return [{key: EPIR_SESSION_CART_ATTR_KEY, value: v}];
}

export function mergeCartAttributes(
  existing: AttributeInput[] | undefined,
  additions: AttributeInput[],
): AttributeInput[] {
  const keys = new Set(additions.map((a) => a.key));
  const kept = (existing ?? []).filter((a) => !keys.has(a.key));
  return [...kept, ...additions];
}

export function withStorefrontCartInput(
  input: CartInput,
  value: EpirStorefrontCartValue,
  sessionId?: string | null,
): CartInput {
  const additions = [...storefrontCartAttributeInput(value)];
  if (sessionId?.trim()) additions.push(...sessionCartAttributeInput(sessionId));
  const existing = input.attributes ?? [];
  const without = existing.filter(
    (a) =>
      a.key !== EPIR_STOREFRONT_CART_ATTR_KEY && a.key !== EPIR_SESSION_CART_ATTR_KEY,
  );
  return {
    ...input,
    attributes: [...without, ...additions],
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

function readSessionFromAttributes(attributes: AttrList | null | undefined): string | null {
  for (const a of attributes ?? []) {
    if (a?.key === EPIR_SESSION_CART_ATTR_KEY && a.value?.trim()) return a.value.trim();
  }
  return null;
}

/** Idempotent: set _epir_storefront i opcjonalnie _epir_session_id na koszyku. */
export async function ensureStorefrontCartAttribute(
  storefront: Storefront,
  cartId: string,
  value: EpirStorefrontCartValue,
  sessionId?: string | null,
): Promise<void> {
  const data = await storefront.query<{
    cart: {attributes: AttrList} | null;
  }>(CART_ATTRS_QUERY, {
    variables: {cartId},
    cache: storefront.CacheNone(),
  });

  const attrs = data?.cart?.attributes;
  const currentStorefront = readEpirStorefrontFromAttributes(attrs);
  const currentSession = readSessionFromAttributes(attrs);
  const wantSession = sessionId?.trim() ?? null;

  const storefrontOk = currentStorefront === value;
  const sessionOk = !wantSession || currentSession === wantSession;
  if (storefrontOk && sessionOk) return;

  const next = mergeCartAttributes(
    attrs?.map((a) => ({key: a.key ?? '', value: a.value ?? ''})) ?? [],
    [
      ...storefrontCartAttributeInput(value),
      ...(wantSession ? sessionCartAttributeInput(wantSession) : []),
    ],
  );

  await storefront.mutate(CART_ATTRS_UPDATE, {
    variables: {
      cartId,
      attributes: next,
    },
  });
}
