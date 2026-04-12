/**
 * worker/src/mcp_tools.ts
 * 
 * Definicje narzędzi MCP zgodne z:
 * - OpenAI function-calling: https://platform.openai.com/docs/guides/function-calling
 * - Shopify Storefront MCP: https://shopify.dev/docs/apps/build/storefront-mcp/servers/storefront
 * 
 * UWAGA:
 * - Narzędzia commerce (`search_catalog`, `search_shop_policies_and_faqs`, `get_cart`, `update_cart`)
 *   delegują do Shopify MCP.
 * - `get_size_table` jest narzędziem wewnętrznym worker-a i korzysta bezpośrednio ze Storefront API.
 */

/**
 * JSON Schema definitions for Shopify Storefront MCP tools.
 * Format zgodny z OpenAI function-calling.
 */
export const TOOL_SCHEMAS = {
  search_catalog: {
    name: 'search_catalog',
    description: 'Search for products from the online store using UCP catalog schema.',
    parameters: {
      type: 'object',
      properties: {
        meta: {
          type: 'object',
          description: 'MCP transport metadata for UCP agent discovery.',
          properties: {
            'ucp-agent': {
              type: 'object',
              properties: {
                profile: {
                  type: 'string',
                  description: 'Agent profile URI for UCP discovery.'
                }
              }
            }
          }
        },
        catalog: {
          type: 'object',
          description: 'Catalog search parameters.',
          properties: {
            query: {
              type: 'string',
              description: 'Free-text search query.'
            },
            context: {
              type: 'object',
              description: 'Buyer context signals for relevance and localization.',
              properties: {
                address_country: { type: 'string', description: 'ISO 3166-1 alpha-2 country code (e.g., US, CA, GB).' },
                address_region: { type: 'string', description: 'First-level administrative division (e.g., CA).' },
                postal_code: { type: 'string', description: 'Postal or ZIP code.' },
                language: { type: 'string', description: 'IETF BCP 47 language tag (e.g., en, pl-PL).' },
                currency: { type: 'string', description: 'ISO 4217 currency code (e.g., USD, PLN).' },
                intent: { type: 'string', description: 'Natural-language context describing buyer intent.' }
              }
            },
            filters: {
              type: 'object',
              description: 'Optional filter criteria.',
              properties: {
                categories: {
                  type: 'array',
                  items: { type: 'string' },
                  description: 'Lista kategorii produktów (nazwy, slugi lub identyfikatory). Wyszukiwanie używa logiki OR — produkt pasuje, jeśli należy do przynajmniej jednej z podanych kategorii. Przekaż tablicę stringów (np. ["pierścionki", "obrączki"]). Używaj wartości zgodnych z katalogiem sklepu; nie gwarantujemy automatycznego mapowania aliasów ani hierarchii kategorii.'
                },
                price: {
                  type: 'object',
                  description: 'Price range filter in minor currency units.',
                  properties: {
                    min: { type: 'number', description: 'Minimum price in minor units (e.g., 5000 for 50.00).' },
                    max: { type: 'number', description: 'Maximum price in minor units (e.g., 10000 for 100.00).' }
                  }
                }
              }
            },
            pagination: {
              type: 'object',
              description: 'Pagination parameters.',
              properties: {
                cursor: { type: 'string', description: 'Opaque cursor from previous response.' },
                limit: { type: 'number', description: 'Requested page size; chat worker clamps to max 3 for buyer-facing catalog.' }
              }
            }
          }
        }
      },
      required: ['catalog']
    }
  },

  search_shop_policies_and_faqs: {
    name: 'search_shop_policies_and_faqs',
    description: 'Answer questions about the store\'s policies, products, and services. Use for questions about shipping, returns, refunds, FAQs, and store information.',
    parameters: {
      type: 'object',
      properties: {
        query: {
          type: 'string',
          description: 'The question about policies or FAQs'
        },
        context: {
          type: 'string',
          description: 'Additional context like current product (optional)'
        }
      },
      required: ['query']
    }
  },

  get_size_table: {
    name: 'get_size_table',
    description: 'Pobiera tabelę rozmiarów pierścionków (PL/US/UK/średnica mm/obwód mm). Użyj gdy klient pyta o rozmiar pierścionka, jak zmierzyć palec, lub prosi o przeliczenie rozmiaru.',
    parameters: {
      type: 'object',
      properties: {},
      required: [],
    },
  },

  get_cart: {
    name: 'get_cart',
    description: 'Retrieve current shopping cart contents, including item details and checkout URL.',
    parameters: {
      type: 'object',
      properties: {
        cart_id: {
          type: 'string',
          description: 'ID of an existing cart (e.g., gid://shopify/Cart/abc123def456)'
        }
      },
      required: ['cart_id']
    }
  },

  run_analytics_query: {
    name: 'run_analytics_query',
    description: 'Wykonuje whitelistowane zapytanie analityczne zgodne z kanonicznym kontraktem danych EPIR. Dostępne TYLKO dla internal-dashboard. Zwraca wyniki z BigQuery (events_raw, messages_raw).',
    parameters: {
      type: 'object',
      properties: {
        queryId: {
          type: 'string',
          description: 'ID zapytania z whitelisty: Q1_CONVERSION_CHAT, Q2_CONVERSION_PATHS, Q3_TOP_CHAT_QUESTIONS, Q4_STOREFRONT_SEGMENTATION, Q5_TOP_PRODUCTS, Q6_CHAT_ENGAGEMENT, Q7_PRODUCT_TO_PURCHASE, Q8_DAILY_EVENTS, Q9_TOOL_USAGE, Q10_SESSION_DURATION',
          enum: ['Q1_CONVERSION_CHAT', 'Q2_CONVERSION_PATHS', 'Q3_TOP_CHAT_QUESTIONS', 'Q4_STOREFRONT_SEGMENTATION', 'Q5_TOP_PRODUCTS', 'Q6_CHAT_ENGAGEMENT', 'Q7_PRODUCT_TO_PURCHASE', 'Q8_DAILY_EVENTS', 'Q9_TOOL_USAGE', 'Q10_SESSION_DURATION'],
        },
        dateFrom: {
          type: 'number',
          description: 'Opcjonalnie: początek zakresu dat (Unix ms)',
        },
        dateTo: {
          type: 'number',
          description: 'Opcjonalnie: koniec zakresu dat (Unix ms)',
        },
      },
      required: ['queryId'],
    },
  },

  update_cart: {
    name: 'update_cart',
    description: 'Perform updates to a cart including add/update/remove line items and buyer identity.',
    parameters: {
      type: 'object',
      additionalProperties: false,
      properties: {
        cart_id: {
          type: 'string',
          description: 'Identifier for the cart being updated. If not provided, a new cart will be created.'
        },
        add_items: {
          type: 'array',
          description: 'Items to add to the cart. Required when creating a new cart.',
          items: {
            type: 'object',
            properties: {
              product_variant_id: {
                type: 'string',
                description: 'Product variant ID (e.g., gid://shopify/ProductVariant/789012).'
              },
              quantity: {
                type: 'integer',
                minimum: 1,
                description: 'Quantity to add.'
              }
            },
            required: ['product_variant_id', 'quantity']
          },
        },
        update_items: {
          type: 'array',
          description: 'Existing cart line items to update quantities for. Use quantity 0 to remove an item.',
          items: {
            type: 'object',
            properties: {
              id: {
                type: 'string',
                description: 'Cart line ID to update.'
              },
              quantity: {
                type: 'integer',
                minimum: 0,
                description: 'New quantity for the line item. Use 0 to remove.'
              }
            },
            required: ['id', 'quantity']
          }
        },
        remove_line_ids: {
          type: 'array',
          description: 'List of line item IDs to remove explicitly.',
          items: { type: 'string' }
        },
        buyer_identity: {
          type: 'object',
          description: 'Information about the buyer including email, phone and country code.',
          additionalProperties: false,
          properties: {
            email: { type: 'string', description: 'Buyer email.' },
            phone: { type: 'string', description: 'Buyer phone number.' },
            country_code: { type: 'string', description: 'ISO country code used for regional pricing.' }
          }
        },
        note: {
          type: 'string',
          description: 'Optional cart note.'
        }
      }
    }
  }
};

/**
 * Returns tool schemas as array for OpenAI function-calling format.
 */
export function getToolDefinitions() {
  return Object.values(TOOL_SCHEMAS).map((schema) => ({
    type: 'function' as const,
    function: {
      name: schema.name,
      description: schema.description,
      parameters: schema.parameters,
    },
  }));
}

/**
 * Returns all tool schemas as JSON string (for embedding in system message if needed).
 */
export function getToolSchemasJson(): string {
  return JSON.stringify(Object.values(TOOL_SCHEMAS), null, 2);
}

/**
 * Validates function call arguments against the tool's JSON schema.
 * Returns { ok: true } if valid, { ok: false, errors: [...] } if invalid.
 * 
 * Note: This is a basic runtime validation. For production, consider using
 * a full JSON Schema validator like Ajv.
 */
export function validateFunctionSignature(
  toolName: string,
  args: any
): { ok: boolean; errors?: string[] } {
  const schema = TOOL_SCHEMAS[toolName as keyof typeof TOOL_SCHEMAS];
  
  if (!schema) {
    return { ok: false, errors: [`Unknown tool: ${toolName}`] };
  }

  const errors: string[] = [];
  const params = schema.parameters as any; // Type assertion for JSON Schema flexibility

  // Check required parameters
  if (params.required && Array.isArray(params.required)) {
    for (const requiredParam of params.required) {
      if (!(requiredParam in args)) {
        errors.push(`Missing required parameter: ${requiredParam}`);
      }
    }
  }

  // Basic type checking for known properties
  if (params.properties && typeof params.properties === 'object') {
    for (const [key, propSchema] of Object.entries(params.properties)) {
      if (key in args) {
        const value = args[key];
        const prop = propSchema as any;

        // Type validation
        if (prop.type) {
          const expectedTypes = Array.isArray(prop.type) ? prop.type : [prop.type];
          const actualType = Array.isArray(value) ? 'array' : typeof value;
          
          if (!expectedTypes.includes(actualType) && !expectedTypes.includes('null') || (value === null && !expectedTypes.includes('null'))) {
            errors.push(`Invalid type for ${key}: expected ${expectedTypes.join(' or ')}, got ${actualType}`);
          }

          // Array item validation
          if (actualType === 'array' && prop.items) {
            for (let i = 0; i < value.length; i++) {
              const item = value[i];
              const itemType = typeof item;
              const expectedItemType = prop.items.type;

              if (expectedItemType && itemType !== expectedItemType && !(item === null && expectedItemType === 'null')) {
                errors.push(`Invalid type for ${key}[${i}]: expected ${expectedItemType}, got ${itemType}`);
              }

              // Object item property validation (e.g., cart lines)
              if (itemType === 'object' && prop.items.properties) {
                const itemRequired = prop.items.required || [];
                for (const reqKey of itemRequired) {
                  if (!(reqKey in item)) {
                    errors.push(`Missing required property ${reqKey} in ${key}[${i}]`);
                  }
                }

                // Type validation for object properties (e.g., quantity must be number)
                for (const [propKey, propValue] of Object.entries(prop.items.properties)) {
                  if (propKey in item) {
                    const propSchema = propValue as any;
                    const actualPropType = typeof item[propKey];
                    const expectedPropType = propSchema.type;

                    if (expectedPropType && actualPropType !== expectedPropType && !(item[propKey] === null && expectedPropType === 'null')) {
                      errors.push(`Invalid type for ${key}[${i}].${propKey}: expected ${expectedPropType}, got ${actualPropType}`);
                    }
                  }
                }
              }
            }
          }

          // Enum validation
          if (prop.enum && !prop.enum.includes(value)) {
            errors.push(`Invalid value for ${key}: expected one of ${prop.enum.join(', ')}, got ${value}`);
          }

          // Number range validation
          if (prop.minimum !== undefined && typeof value === 'number' && value < prop.minimum) {
            errors.push(`Value for ${key} is below minimum: ${value} < ${prop.minimum}`);
          }
          if (prop.maximum !== undefined && typeof value === 'number' && value > prop.maximum) {
            errors.push(`Value for ${key} exceeds maximum: ${value} > ${prop.maximum}`);
          }
        }
      }
    }
  }

  return errors.length === 0 ? { ok: true } : { ok: false, errors };
}

/**
 * Validates and executes a tool call.
 * Returns the tool result or an error object.
 * 
 * @param toolName - Name of the tool to execute
 * @param args - Arguments for the tool
 * @param executeToolFn - Function that executes the tool (injected for testability)
 * @returns Tool result or error
 */
export async function executeToolValidated(
  toolName: string,
  args: any,
  executeToolFn: (name: string, args: any) => Promise<any>
): Promise<{ ok: boolean; result?: any; error?: { code: number; message: string; details?: any } }> {
  // Step 1: Validate arguments
  const validation = validateFunctionSignature(toolName, args);
  
  if (!validation.ok) {
    return {
      ok: false,
      error: {
        code: -32602,
        message: 'Invalid tool arguments',
        details: { errors: validation.errors }
      }
    };
  }

  // Step 2: Execute tool
  try {
    const result = await executeToolFn(toolName, args);
    return { ok: true, result };
  } catch (err: any) {
    console.error(`[mcp_tools] Tool execution failed: ${toolName}`, err);
    return {
      ok: false,
      error: {
        code: -32000,
        message: 'Tool execution failed',
        details: { message: err.message || String(err) }
      }
    };
  }
}
