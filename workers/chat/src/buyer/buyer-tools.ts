import type { GroqToolCallDefinition } from '../ai-client';
import type { BuyerToolId } from './tool-readiness';

const CREATE_CART: GroqToolCallDefinition = {
  type: 'function',
  function: {
    name: 'create_cart',
    description:
      'Tworzy koszyk z wybranymi wariantami (gid://shopify/ProductVariant/...). Tylko po wyraźnej zgodzie klienta. Gdy produkt ma wiele wariantów — najpierw zapytaj o wariant.',
    parameters: {
      type: 'object',
      additionalProperties: false,
      properties: {
        line_items: {
          type: 'array',
          items: {
            type: 'object',
            additionalProperties: false,
            properties: {
              quantity: { type: 'integer', minimum: 1 },
              item: {
                type: 'object',
                additionalProperties: false,
                properties: {
                  id: {
                    type: 'string',
                    description: 'Product variant GID from catalog facts of this turn.',
                  },
                },
                required: ['id'],
              },
            },
            required: ['quantity', 'item'],
          },
        },
      },
      required: ['line_items'],
    },
  },
};

/** No id/cart_id — executor injects SessionDO cart id only. */
const GET_CART: GroqToolCallDefinition = {
  type: 'function',
  function: {
    name: 'get_cart',
    description: 'Pobiera koszyk bieżącej sesji klienta. Nie podawaj id koszyka.',
    parameters: {
      type: 'object',
      additionalProperties: false,
      properties: {},
    },
  },
};

const UPDATE_CART: GroqToolCallDefinition = {
  type: 'function',
  function: {
    name: 'update_cart',
    description:
      'Zmienia koszyk sesji przez łatkę (add_items / update_items / remove_line_ids). Nie podawaj pełnej listy line_items ani id koszyka — serwer scala z koszykiem sesji.',
    parameters: {
      type: 'object',
      additionalProperties: false,
      properties: {
        add_items: {
          type: 'array',
          items: {
            type: 'object',
            properties: {
              product_variant_id: { type: 'string' },
              quantity: { type: 'integer', minimum: 1 },
            },
            required: ['product_variant_id', 'quantity'],
          },
        },
        update_items: {
          type: 'array',
          items: {
            type: 'object',
            properties: {
              id: { type: 'string', description: 'Cart line id' },
              quantity: { type: 'integer', minimum: 0 },
            },
            required: ['id', 'quantity'],
          },
        },
        remove_line_ids: {
          type: 'array',
          items: { type: 'string' },
        },
      },
    },
  },
};

const CANCEL_CART: GroqToolCallDefinition = {
  type: 'function',
  function: {
    name: 'cancel_cart',
    description: 'Anuluje koszyk bieżącej sesji. Nie podawaj id koszyka.',
    parameters: {
      type: 'object',
      additionalProperties: false,
      properties: {},
    },
  },
};

const SEARCH_POLICIES: GroqToolCallDefinition = {
  type: 'function',
  function: {
    name: 'search_shop_policies_and_faqs',
    description:
      'Polityki sklepu, zwroty, wysyłka, kontakt, FAQ. Cytuj odpowiedź bazy wiedzy; nie dopowiadaj.',
    parameters: {
      type: 'object',
      additionalProperties: false,
      properties: {
        query: { type: 'string' },
        context: { type: 'string' },
      },
      required: ['query'],
    },
  },
};

const GET_SIZE_TABLE: GroqToolCallDefinition = {
  type: 'function',
  function: {
    name: 'get_size_table',
    description: 'Tabela rozmiarów pierścionka / pomiar palca dla marki bieżącego kanału.',
    parameters: {
      type: 'object',
      additionalProperties: false,
      properties: {},
    },
  },
};

/** Maps readiness ids to model-facing tool definitions. */
export function buildBuyerToolDefinitions(ready: BuyerToolId[]): GroqToolCallDefinition[] {
  const out: GroqToolCallDefinition[] = [];
  const set = new Set(ready);

  if (set.has('ucp_cart')) {
    out.push(CREATE_CART, GET_CART, UPDATE_CART, CANCEL_CART);
  }
  if (set.has('search_shop_policies_and_faqs')) {
    out.push(SEARCH_POLICIES);
  }
  if (set.has('get_size_table')) {
    out.push(GET_SIZE_TABLE);
  }
  // search_catalog / customer_account_profile: not wired in D2 tool loop (facts path / stage F).
  return out;
}

export function buyerToolIdForName(name: string): BuyerToolId | null {
  if (
    name === 'create_cart' ||
    name === 'get_cart' ||
    name === 'update_cart' ||
    name === 'cancel_cart'
  ) {
    return 'ucp_cart';
  }
  if (name === 'search_shop_policies_and_faqs') return 'search_shop_policies_and_faqs';
  if (name === 'get_size_table') return 'get_size_table';
  return null;
}
