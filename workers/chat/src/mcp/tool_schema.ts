/**
 * Definicja parametrów dla funkcji search_catalog (UCP).
 */
const searchCatalogSchema = {
  type: "object",
  properties: {
    meta: {
      type: "object",
      description: "MCP transport metadata for UCP agent discovery.",
      properties: {
        "ucp-agent": {
          type: "object",
          properties: {
            profile: {
              type: "string",
              description: "Agent profile URI for UCP discovery."
            }
          }
        }
      }
    },
    catalog: {
      type: "object",
      description: "Catalog search parameters.",
      properties: {
        query: {
          type: "string",
          description: "Free-text search query."
        },
        context: {
          type: "object",
          description: "Buyer context signals for relevance/localization.",
          properties: {
            address_country: { type: "string" },
            address_region: { type: "string" },
            postal_code: { type: "string" },
            language: { type: "string" },
            currency: { type: "string" },
            intent: { type: "string" }
          }
        },
        filters: {
          type: "object",
          properties: {
            categories: {
              type: "array",
              items: { type: "string" }
            },
            price: {
              type: "object",
              properties: {
                min: { type: "number" },
                max: { type: "number" }
              }
            }
          }
        },
        pagination: {
          type: "object",
          properties: {
            cursor: { type: "string" },
            limit: { type: "number" }
          }
        }
      }
    }
  },
  required: ["catalog"]
};

/**
 * Definicja parametrów dla funkcji get_cart.
 */
const getCartSchema = {
  type: "object",
  description: "Pobiera aktualną zawartość koszyka klienta, co jest niezbędne przed jakąkolwiek modyfikacją lub podsumowaniem transakcji. Nie wymaga parametrów.",
  properties: {}
};

/**
 * Definicja parametrów dla funkcji update_cart (UCP).
 */
const updateCartSchema = {
  type: "object",
  additionalProperties: false,
  properties: {
    cart_id: {
      type: "string",
      description: "Identifier for the cart being updated. If not provided, a new cart will be created."
    },
    add_items: {
      type: "array",
      description: "Items to add to the cart. Required when creating a new cart.",
      items: {
        type: "object",
        properties: {
          product_variant_id: {
            type: "string",
            description: "Product variant ID (e.g., gid://shopify/ProductVariant/123)."
          },
          quantity: {
            type: "integer",
            description: "Quantity to add, minimum 1."
          }
        },
        required: ["product_variant_id", "quantity"]
      }
    },
    update_items: {
      type: "array",
      description: "Existing cart line items to update quantities for. Use quantity 0 to remove an item.",
      items: {
        type: "object",
        properties: {
          id: {
            type: "string",
            description: "Cart line ID."
          },
          quantity: {
            type: "integer",
            description: "New quantity (0 removes the item)."
          }
        },
        required: ["id", "quantity"]
      }
    },
    remove_line_ids: {
      type: "array",
      description: "List of line item IDs to remove explicitly.",
      items: { type: "string" }
    },
    buyer_identity: {
      type: "object",
      additionalProperties: false,
      properties: {
        email: { type: "string" },
        phone: { type: "string" },
        country_code: { type: "string" }
      }
    },
    note: {
      type: "string"
    }
  }
};

/**
 * Definicja parametrów dla funkcji search_shop_policies_and_faqs.
 */
const searchPoliciesSchema = {
  type: "object",
  properties: {
    query: {
      type: "string",
      description: "Zapytanie dotyczące zasad sklepu lub FAQ, np. 'polityka zwrotów', 'czas dostawy', 'gwarancja na grawerowanie'.",
    }
  },
  required: ["query"]
};

/**
 * Definicja parametrów dla funkcji get_order_status.
 */
const getOrderStatusSchema = {
  type: "object",
  properties: {
    order_id: {
      type: "string",
      description: "ID zamówienia do sprawdzenia (np. 'gid://shopify/Order/123456789' lub numer zamówienia)."
    }
  },
  required: ["order_id"]
};

/**
 * Definicja parametrów dla funkcji get_most_recent_order_status.
 */
const getMostRecentOrderStatusSchema = {
  type: "object",
  description: "Pobiera status ostatniego zamówienia dla bieżącego klienta. Nie wymaga parametrów.",
  properties: {}
};

/**
 * Generuje pełny schemat narzędzi MCP w formacie JSON zgodnym ze specyfikacją Function Calling/Tool Use.
 * @returns Pełny schemat JSON jako string.
 */
export function generateMcpToolSchema(): string {
  const tools = [
    {
      type: "function",
      function: {
        name: "search_catalog",
        description: "Wyszukuje produkty w katalogu sklepu w strukturze UCP (meta/catalog/pagination).",
        parameters: searchCatalogSchema
      }
    },
    {
      type: "function",
      function: {
        name: "get_cart",
        description: "Pobiera aktualny koszyk klienta. Niezbędne przed podjęciem działań, takich jak dodawanie produktów.",
        parameters: getCartSchema
      }
    },
    {
      type: "function",
      function: {
        name: "update_cart",
        description: "Aktualizuje koszyk klienta (dodawanie/usuwanie/zmiana ilości) w strukturze UCP.",
        parameters: updateCartSchema
      }
    },
    {
      type: "function",
      function: {
        name: "search_shop_policies_and_faqs",
        description: "Wyszukuje w dokumentacji i politykach sklepu, takich jak zwroty, wysyłka czy gwarancja. Używaj dla pytań o zasady, a nie o produkty.",
        parameters: searchPoliciesSchema
      }
    },
    {
      type: "function",
      function: {
        name: "get_order_status",
        description: "Pobiera status i szczegóły konkretnego zamówienia po jego ID.",
        parameters: getOrderStatusSchema
      }
    },
    {
      type: "function",
      function: {
        name: "get_most_recent_order_status",
        description: "Pobiera status ostatniego zamówienia dla bieżącego klienta.",
        parameters: getMostRecentOrderStatusSchema
      }
    }
  ];

  // Zwracamy string JSON dla łatwego wstrzyknięcia do promptu LLM
  return JSON.stringify(tools, null, 2);
}

// Przykład użycia, pokazujący, jak schemat będzie wyglądał w promptcie:
// const schemaString = generateMcpToolSchema();
// console.log(schemaString);