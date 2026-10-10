import type { GroqToolCallDefinition } from '../ai-client';
import type { BuyerToolId } from './tool-readiness';

const SEARCH_CATALOG: GroqToolCallDefinition = {
  type: 'function',
  function: {
    name: 'search_catalog',
    description:
      'Wyszukuje produkty po opisie klienta (naturalny język). Podaj sam rdzeń zapytania; opcjonalnie budżet w zł (price_min_pln / price_max_pln). Nie podawaj waluty, limitu ani filtrów spoza schematu.',
    parameters: {
      type: 'object',
      additionalProperties: false,
      properties: {
        query: {
          type: 'string',
          description: 'Rdzeń zapytania, 2–120 znaków, np. pierścionek zaręczynowy brylant',
        },
        price_max_pln: {type: 'integer', minimum: 1, maximum: 1_000_000},
        price_min_pln: {type: 'integer', minimum: 1, maximum: 1_000_000},
        intent: {
          type: 'string',
          description: 'Opcjonalny kontekst intencji zakupowej, do 200 znaków',
        },
      },
      required: ['query'],
    },
  },
};

const CREATE_CART: GroqToolCallDefinition = {
  type: 'function',
  function: {
    name: 'create_cart',
    description:
      'Tworzy koszyk z wybranymi wariantami (id wariantu z sekcji DANE TECHNICZNE). Tylko po wyraźnej zgodzie klienta. Gdy produkt ma wiele wariantów — najpierw zapytaj o wariant.',
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
                    description: 'Id wariantu z sekcji DANE TECHNICZNE wyniku search_catalog lub produktu na stronie.',
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

/** Tools exposed to Groq when readiness allows (intersected per turn). */
export const MODEL_WIRED_BUYER_TOOLS: BuyerToolId[] = [
  'search_catalog',
  'ucp_cart',
  'search_shop_policies_and_faqs',
  'get_size_table',
];

export function filterModelWiredBuyerTools(tools: BuyerToolId[]): BuyerToolId[] {
  const wired = new Set<BuyerToolId>(MODEL_WIRED_BUYER_TOOLS);
  return tools.filter((t) => wired.has(t));
}

/** Maps readiness ids to model-facing tool definitions (only MODEL_WIRED_BUYER_TOOLS). */
export function buildBuyerToolDefinitions(ready: BuyerToolId[]): GroqToolCallDefinition[] {
  const out: GroqToolCallDefinition[] = [];
  const set = new Set(filterModelWiredBuyerTools(ready));

  if (set.has('search_catalog')) {
    out.push(SEARCH_CATALOG);
  }
  if (set.has('ucp_cart')) {
    out.push(CREATE_CART, GET_CART, UPDATE_CART, CANCEL_CART);
  }
  if (set.has('search_shop_policies_and_faqs')) {
    out.push(SEARCH_POLICIES);
  }
  if (set.has('get_size_table')) {
    out.push(GET_SIZE_TABLE);
  }
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
  if (name === 'search_catalog') return 'search_catalog';
  return null;
}
