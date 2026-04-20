import {Link, useLoaderData} from '@remix-run/react';
import {json, LoaderArgs} from '@remix-run/cloudflare';
import {Storefront} from '@shopify/hydrogen';
import {
  AttributeInput,
  CartInput,
  CartLineInput,
  CountryCode,
} from '@shopify/hydrogen/dist/storefront-api-types';
import {CART_QUERY} from '~/queries/cart';
import {CartLineItems, CartSummary, CartActions} from '@epir/ui';

const EPIR_SESSION_ATTR_KEY = '_epir_session_id';

/** 128-bitowy identyfikator (32 znaki hex) — bez znaków specjalnych dla atrybutu koszyka. */
function generateEpirSessionId(): string {
  const bytes = new Uint8Array(16);
  crypto.getRandomValues(bytes);
  return [...bytes].map((b) => b.toString(16).padStart(2, '0')).join('');
}

async function ensureEpSessionId(session: {
  get: (key: string) => unknown;
  set: (key: string, value: string) => void;
}): Promise<string> {
  const existing = await session.get(EPIR_SESSION_ATTR_KEY);
  if (typeof existing === 'string' && existing.trim().length > 0) {
    return existing.trim();
  }
  const id = generateEpirSessionId();
  session.set(EPIR_SESSION_ATTR_KEY, id);
  return id;
}

type CartAttribute = {key: string; value: string | null};

function mergeEpirSessionIntoAttributes(
  attributes: readonly CartAttribute[] | null | undefined,
  epirSessionId: string,
): AttributeInput[] {
  const rest = (attributes ?? [])
    .filter((a): a is CartAttribute => Boolean(a?.key))
    .filter((a) => a.key !== EPIR_SESSION_ATTR_KEY)
    .map((a) => ({key: a.key, value: a.value ?? ''}));
  return [...rest, {key: EPIR_SESSION_ATTR_KEY, value: epirSessionId}];
}

function getEpirSessionFromCartAttributes(
  attributes: readonly CartAttribute[] | null | undefined,
): string | undefined {
  const raw = (attributes ?? []).find(
    (a) => a?.key === EPIR_SESSION_ATTR_KEY,
  )?.value;
  return typeof raw === 'string' && raw.length > 0 ? raw : undefined;
}

export async function loader({context}: LoaderArgs) {
  const cartId = await context.session.get('cartId');

  const cart = cartId
    ? (
        await context.storefront.query(CART_QUERY, {
          variables: {
            cartId,
            country: context.storefront.i18n.country,
            language: context.storefront.i18n.language,
          },
          cache: context.storefront.CacheNone(),
        })
      ).cart
    : null;

  return {cart};
}

export async function action({request, context}: LoaderArgs) {
  const {session, storefront} = context;
  const headers = new Headers();

  const epirSessionId = await ensureEpSessionId(session);

  const [formData, storedCartId] = await Promise.all([
    request.formData(),
    session.get('cartId'),
  ]);

  let cartId = storedCartId as string | undefined;

  let status = 200;
  let result;

  const cartAction = formData.get('cartAction');
  const countryCode = formData.get('countryCode')
    ? formData.get('countryCode')
    : null;

  switch (cartAction) {
    case 'ADD_TO_CART': {
      const lines = formData.get('lines')
        ? JSON.parse(String(formData.get('lines')))
        : [];

      let resolvedCartId = cartId;
      let existingCartForAttrs: {attributes?: CartAttribute[] | null} | null =
        null;

      if (resolvedCartId) {
        const {cart: cartForAttrs} = (await storefront.query(CART_ATTRIBUTES_QUERY, {
          variables: {
            cartId: resolvedCartId,
            country: storefront.i18n.country,
            language: storefront.i18n.language,
          },
          cache: storefront.CacheNone(),
        })) as any;
        if (!cartForAttrs) {
          resolvedCartId = undefined;
        } else {
          existingCartForAttrs = cartForAttrs;
        }
      }

      if (!resolvedCartId) {
        const input: CartInput = {
          lines,
          attributes: [{key: EPIR_SESSION_ATTR_KEY, value: epirSessionId}],
        };
        if (countryCode) {
          input.buyerIdentity = {countryCode: countryCode as CountryCode};
        }
        result = await cartCreate(input, storefront);
      } else {
        const currentAttrs = existingCartForAttrs?.attributes;
        const existingEpir = getEpirSessionFromCartAttributes(currentAttrs);
        const targetAttrs = mergeEpirSessionIntoAttributes(
          currentAttrs ?? [],
          epirSessionId,
        );

        const needsAttributeUpdate = existingEpir !== epirSessionId;

        if (needsAttributeUpdate) {
          const updateResult = await cartUpdateAttributes(
            resolvedCartId,
            targetAttrs,
            storefront,
          );
          result = updateResult;
          resolvedCartId = updateResult.cart.id;
        }

        const addResult = await cartAdd(resolvedCartId, lines, storefront);
        result = addResult;
      }

      cartId = result.cart.id;
      break;
    }
    case 'REMOVE_FROM_CART': {
      if (!cartId) {
        return json(
          {
            error: 'Brak identyfikatora koszyka w sesji',
            cart: null,
            errors: [],
          },
          {
            status: 400,
            headers: {'Set-Cookie': await session.commit()},
          },
        );
      }

      const lineIds = formData.get('linesIds')
        ? JSON.parse(String(formData.get('linesIds')))
        : [];

      if (!lineIds.length) {
        throw new Error('No lines to remove');
      }

      result = await cartRemove(cartId, lineIds, storefront);

      cartId = result.cart.id;
      break;
    }
    default:
      throw new Error('Invalid cart action');
  }

  /**
   * The Cart ID may change after each mutation. We need to update it each time in the session.
   */
  session.set('cartId', cartId);
  headers.set('Set-Cookie', await session.commit());

  const {cart, errors} = result;
  return json({cart, errors}, {status, headers});
}

export default function Cart() {
  const {cart} = useLoaderData() as any;

  if (cart?.totalQuantity > 0)
    return (
      <div className="w-full max-w-6xl mx-auto pb-12 grid md:grid-cols-2 md:items-start gap-8 md:gap-8 lg:gap-12">
        <div className="flex-grow md:translate-y-4">
          <CartLineItems linesObj={cart.lines} />
        </div>
        <div className="fixed left-0 right-0 bottom-0 md:sticky md:top-[65px] grid gap-6 p-4 md:px-6 md:translate-y-4 bg-gray-100 rounded-md w-full">
          <CartSummary cost={cart.cost} />
          <CartActions checkoutUrl={cart.checkoutUrl} />
        </div>
      </div>
    );

  return (
    <div className="flex flex-col space-y-7 justify-center items-center md:py-8 md:px-12 px-4 py-6 h-screen">
      <h2 className="whitespace-pre-wrap max-w-prose font-bold text-4xl">
        Your cart is empty
      </h2>
      <Link
        to="/"
        className="inline-block rounded-sm font-medium text-center py-3 px-6 max-w-xl leading-none bg-black text-white w-full"
      >
        Continue shopping
      </Link>
    </div>
  );
}

/**
 * Create a cart with line(s) mutation
 * @param input CartInput https://shopify.dev/api/storefront/{api_version}/input-objects/CartInput
 * @param storefront
 * @see https://shopify.dev/api/storefront/{api_version}/mutations/cartcreate
 * @returns result {cart, errors}
 * @preserve
 */
export async function cartCreate(input: CartInput, storefront: Storefront) {
  const {cartCreate} = await storefront.mutate(CREATE_CART_MUTATION, {
    variables: {input},
  });

  return cartCreate;
}

/**
 * Storefront API cartLinesAdd mutation
 * @param cartId
 * @param lines [CartLineInput!]! https://shopify.dev/api/storefront/{api_version}/input-objects/CartLineInput
 * @param storefront
 * @see https://shopify.dev/api/storefront/{api_version}/mutations/cartLinesAdd
 * @returns result {cart, errors}
 * @preserve
 */
export async function cartAdd(
  cartId: string,
  lines: CartLineInput[],
  storefront: Storefront,
) {
  const {cartLinesAdd} = await storefront.mutate(ADD_LINES_MUTATION, {
    variables: {cartId, lines},
  });

  return cartLinesAdd;
}

/**
 * Aktualizuje atrybuty koszyka (np. scalenie `_epir_session_id` z istniejącymi tagami).
 */
export async function cartUpdateAttributes(
  cartId: string,
  attributes: AttributeInput[],
  storefront: Storefront,
) {
  const {cartAttributesUpdate} = await storefront.mutate(
    CART_ATTRIBUTES_UPDATE_MUTATION,
    {
      variables: {
        cartId,
        attributes,
        country: storefront.i18n.country,
        language: storefront.i18n.language,
      },
    },
  );

  if (!cartAttributesUpdate) {
    throw new Error('No data returned from cartAttributesUpdate');
  }
  return cartAttributesUpdate;
}

/**
 * Create a cart with line(s) mutation
 * @param cartId the current cart id
 * @param lineIds
 * @param storefront
 * @see https://shopify.dev/api/storefront/2022-07/mutations/cartlinesremove
 * @returns mutated cart
 * @preserve
 */
export async function cartRemove(
  cartId: string,
  lineIds: string[],
  storefront: Storefront,
) {
  const {cartLinesRemove} = await storefront.mutate(
    REMOVE_LINE_ITEMS_MUTATION,
    {
      variables: {
        cartId,
        lineIds,
      },
    },
  );

  if (!cartLinesRemove) {
    throw new Error('No data returned from remove lines mutation');
  }
  return cartLinesRemove;
}

/*
  Cart Queries
*/

const USER_ERROR_FRAGMENT = `#graphql
  fragment ErrorFragment on CartUserError {
    message
    field
    code
  }
`;

const LINES_CART_FRAGMENT = `#graphql
  fragment CartLinesFragment on Cart {
    id
    totalQuantity
  }
`;

/** Tylko atrybuty — lekki odczyt przed scaleniem (bez zmiany ~/queries/cart.ts). */
const CART_ATTRIBUTES_QUERY = `#graphql
  query CartAttributes($cartId: ID!, $country: CountryCode, $language: LanguageCode)
  @inContext(country: $country, language: $language) {
    cart(id: $cartId) {
      id
      attributes {
        key
        value
      }
    }
  }
`;

const CART_ATTRIBUTES_UPDATE_MUTATION = `#graphql
  mutation CartAttributesUpdate(
    $cartId: ID!
    $attributes: [AttributeInput!]!
    $country: CountryCode
    $language: LanguageCode
  ) @inContext(country: $country, language: $language) {
    cartAttributesUpdate(cartId: $cartId, attributes: $attributes) {
      cart {
        ...CartLinesFragment
      }
      errors: userErrors {
        ...ErrorFragment
      }
    }
  }
  ${LINES_CART_FRAGMENT}
  ${USER_ERROR_FRAGMENT}
`;

//! @see: https://shopify.dev/api/storefront/{api_version}/mutations/cartcreate
const CREATE_CART_MUTATION = `#graphql
  mutation ($input: CartInput!, $country: CountryCode = ZZ, $language: LanguageCode)
  @inContext(country: $country, language: $language) {
    cartCreate(input: $input) {
      cart {
        ...CartLinesFragment
      }
      errors: userErrors {
        ...ErrorFragment
      }
    }
  }
  ${LINES_CART_FRAGMENT}
  ${USER_ERROR_FRAGMENT}
`;

const ADD_LINES_MUTATION = `#graphql
  mutation ($cartId: ID!, $lines: [CartLineInput!]!, $country: CountryCode = ZZ, $language: LanguageCode)
  @inContext(country: $country, language: $language) {
    cartLinesAdd(cartId: $cartId, lines: $lines) {
      cart {
        ...CartLinesFragment
      }
      errors: userErrors {
        ...ErrorFragment
      }
    }
  }
  ${LINES_CART_FRAGMENT}
  ${USER_ERROR_FRAGMENT}
`;

const REMOVE_LINE_ITEMS_MUTATION = `#graphql
  mutation ($cartId: ID!, $lineIds: [ID!]!, $language: LanguageCode, $country: CountryCode)
  @inContext(country: $country, language: $language) {
    cartLinesRemove(cartId: $cartId, lineIds: $lineIds) {
      cart {
        id
        totalQuantity
        lines(first: 100) {
          edges {
            node {
              id
              quantity
              merchandise {
                ...on ProductVariant {
                  id
                }
              }
            }
          }
        }
      }
      errors: userErrors {
        message
        field
        code
      }
    }
  }
`;
