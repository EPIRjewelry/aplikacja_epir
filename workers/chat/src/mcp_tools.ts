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

import { BLENDER_BRIDGE_TOOL_NAMES, blenderBridgeToolEnumForSchema } from './blender-bridge-tool-catalog';

/**
 * JSON Schema definitions for Shopify Storefront MCP tools.
 * Format zgodny z OpenAI function-calling.
 */
export const TOOL_SCHEMAS = {
  search_catalog: {
    name: 'search_catalog',
    description:
      'Search for products from the online store using UCP catalog schema. Responses include explicit price_minor, currency, and for PLN price_display_pl — quote only price_display_pl for buyers; never invent or rescale PLN amounts.',
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
          description: "Catalog search parameters. Always set this object (e.g. {\"catalog\":{\"query\":\"pierścionek\"}}).",
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
    description:
      'Wykonuje whitelistowane zapytanie analityczne zgodne z kanonicznym kontraktem danych EPIR. Dostępne TYLKO dla kanału operator. Zwraca wyniki z R2 SQL nad tabelami Iceberg (odpowiedniki epir_pixel_events_raw i messages_raw w katalogu R2 Data Catalog).',
    parameters: {
      type: 'object',
      properties: {
        queryId: {
          type: 'string',
          description: 'ID zapytania z whitelisty: Q1_CONVERSION_CHAT, Q2_CONVERSION_PATHS, Q3_TOP_CHAT_QUESTIONS, Q4_STOREFRONT_SEGMENTATION, Q5_TOP_PRODUCTS, Q6_CHAT_ENGAGEMENT, Q7_PRODUCT_TO_PURCHASE, Q8_DAILY_EVENTS, Q9_TOOL_USAGE, Q10_SESSION_DURATION',
          enum: ['Q1_CONVERSION_CHAT', 'Q2_CONVERSION_PATHS', 'Q3_TOP_CHAT_QUESTIONS', 'Q4_STOREFRONT_SEGMENTATION', 'Q5_TOP_PRODUCTS', 'Q6_CHAT_ENGAGEMENT', 'Q7_PRODUCT_TO_PURCHASE', 'Q8_DAILY_EVENTS', 'Q9_TOOL_USAGE', 'Q10_SESSION_DURATION'],
        },
      },
      required: ['queryId'],
    },
  },

  fetch_marketing_preview: {
    name: 'fetch_marketing_preview',
    description:
      'Pobiera z serwera epir-marketing-ingest agregowany podgląd GA4 + Google Ads (GET /ops/marketing-preview, Bearer). Dostępne TYLKO dla kanału operator. Wynik ma pole source=marketing_preview; cytuj liczby wyłącznie z payloadu.',
    parameters: {
      type: 'object',
      properties: {
        date: {
          type: 'string',
          description: 'Opcjonalna data snapshotu w formacie YYYY-MM-DD (UTC). Pominięcie = wczoraj wg logiki worker-a marketingu.',
        },
      },
      required: [],
    },
  },

  get_flow_health: {
    name: 'get_flow_health',
    description:
      'Audyt operacyjny przepływu danych EPIR (EDOG): D1 pixel backlog, batch_exports, pipeline, opcjonalnie sonda Q1. Zwraca edog_verdict, reasons[], narrative_markdown po polsku. Wywołaj PRZED run_analytics_query gdy operator pyta o stan danych lub metryki wydają się podejrzane.',
    parameters: {
      type: 'object',
      properties: {},
      required: [],
    },
  },

  run_shopify_shopifyql: {
    name: 'run_shopify_shopifyql',
    description:
      'Natywna analityka Shopify przez Admin GraphQL shopifyqlQuery — wyłącznie whitelista presetów (S1…S6). Wymaga read_reports. Gdy Shopify zwróci parseErrors, narzędzie zgłasza ShopifyQLPresetExecutionError — nie retry tego samego presetId w pętli.',
    parameters: {
      type: 'object',
      properties: {
        presetId: {
          type: 'string',
          description:
            'S1: sales+sessions dzienne 30d. S2: miesięcznie last_year. S3: net+total sales dzienne 90d. S4: sales tygodniowo 12w. S5: sales+sessions 7d. S6: sales miesięcznie 13m.',
          enum: [
            'S1_SALES_SESSIONS_DAILY_30D',
            'S2_SALES_SESSIONS_MONTHLY_LAST_YEAR',
            'S3_SALES_NET_TOTAL_DAILY_90D',
            'S4_SALES_WEEKLY_12W',
            'S5_SALES_SESSIONS_DAILY_7D',
            'S6_SALES_MONTHLY_13M',
          ],
        },
      },
      required: ['presetId'],
    },
  },

  blender_bridge_invoke: {
    name: 'blender_bridge_invoke',
    description:
      'Blender most HTTP — 32 narzędzi MCP (w tym run_script, node_tool_invoke; tylko rola CAD). Krzywe: curve_cutter_create lub blender_add_curve.',
    parameters: {
      type: 'object',
      properties: {
        tool_name: {
          type: 'string',
          enum: blenderBridgeToolEnumForSchema(),
          description:
            'Nazwa narzędzia MCP. Krzywe/obrysy: curve_cutter_create lub alias blender_add_curve.',
        },
        arguments: {
          type: 'object',
          description:
            'Argumenty narzędzia (np. object_name, name, symbol, host, port, timeout_s).',
        },
      },
      required: ['tool_name', 'arguments'],
    },
  },

  operator_shopify_admin_read: {
    name: 'operator_shopify_admin_read',
    description:
      'Odczyt Admin GraphQL Shopify (whitelist presetów): produkty, kolekcje, artykuły bloga, strony. Tylko kanał operator. Wynik: source=shopify_admin_read.',
    parameters: {
      type: 'object',
      properties: {
        presetId: {
          type: 'string',
          description: 'Whitelist preset Admin read.',
          enum: [
            'A1_PRODUCTS_RECENT',
            'A2_COLLECTIONS_LIST',
            'A3_BLOG_ARTICLES_RECENT',
            'A4_PAGES_LIST',
          ],
        },
      },
      required: ['presetId'],
    },
  },

  query_d1_data: {
    name: 'query_d1_data',
    description:
      'Query D1 databases directly (pixel_events and messages tables) for natural language questions about user behavior and conversations. No Iceberg/R2 needed. Use for questions like "who is talking about what with Gemma", "show me recent conversations", "what products are people viewing", "what are users adding to cart".',
    parameters: {
      type: 'object',
      properties: {
        question: {
          type: 'string',
          description:
            'Natural language question about the data. Examples: "who is talking about what with Gemma", "show me recent conversations", "what products are people viewing", "what are users adding to cart".',
        },
        table: {
          type: 'string',
          enum: ['pixel_events', 'messages', 'both'],
          description:
            'Which table to query. pixel_events: page views, cart events, purchases. messages: chat conversations with Gemma. both: cross-reference both tables.',
        },
        limit: {
          type: 'number',
          description:
            'Maximum number of rows to return. Default: 20, max: 100.',
          minimum: 1,
          maximum: 100,
        },
      },
      required: [],
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
 * TOOL_SCHEMAS_SLIM — odchudzony wariant schematów narzędzi.
 *
 * Cel: zredukować `prompt_tokens` wysyłane w KAŻDEJ turze (model musi przetwarzać
 * definicje narzędzi przy każdym wywołaniu). Szacowany zysk vs TOOL_SCHEMAS:
 * z ~3000 tokenów do ~1200–1500.
 *
 * Reguły redukcji:
 * - `description` na poziomie toola: 1 zwięzłe zdanie (nie 2-3).
 * - `description` sub-parametrów: usunięte (model wnioskuje z nazwy pola).
 * - Semantyka (`enum`, `minimum`, `required`, `type`) — ZACHOWANA (to nie dokumentacja, to walidacja).
 * - Struktura (zagnieżdżenia) — ZACHOWANA (Shopify MCP wymaga konkretnego kształtu).
 *
 * Wybór wariantu: flaga `SLIM_TOOL_SCHEMAS` w `wrangler.toml [vars]`.
 * Włączenie / wyłączenie wymaga redeploy (bezpieczniej niż runtime toggle).
 */
export const TOOL_SCHEMAS_SLIM = {
  search_catalog: {
    name: 'search_catalog',
    description:
      'Szuka produktów w katalogu. Wynik ma price_minor, currency, dla PLN price_display_pl — cytuj tylko price_display_pl; nie przeliczaj z price_minor.',
    parameters: {
      type: 'object',
      properties: {
        catalog: {
          type: 'object',
          description: "Always set this object (e.g. {\"catalog\":{\"query\":\"pierścionek\"}}).",
          properties: {
            query: { type: 'string' },
            context: {
              type: 'object',
              properties: {
                address_country: { type: 'string' },
                address_region: { type: 'string' },
                postal_code: { type: 'string' },
                language: { type: 'string' },
                currency: { type: 'string' },
                intent: { type: 'string' },
              },
            },
            filters: {
              type: 'object',
              properties: {
                categories: { type: 'array', items: { type: 'string' } },
                price: {
                  type: 'object',
                  properties: {
                    min: { type: 'number' },
                    max: { type: 'number' },
                  },
                },
              },
            },
            pagination: {
              type: 'object',
              properties: {
                cursor: { type: 'string' },
                limit: { type: 'number' },
              },
            },
          },
        },
      },
      required: ['catalog'],
    },
  },

  search_shop_policies_and_faqs: {
    name: 'search_shop_policies_and_faqs',
    description: 'Odpowiedzi na pytania o polityki sklepu, wysyłkę, zwroty, FAQ.',
    parameters: {
      type: 'object',
      properties: {
        query: { type: 'string' },
        context: { type: 'string' },
      },
      required: ['query'],
    },
  },

  get_size_table: {
    name: 'get_size_table',
    description: 'Zwraca tabelę rozmiarów pierścionków (PL/US/UK/mm).',
    parameters: { type: 'object', properties: {}, required: [] },
  },

  get_cart: {
    name: 'get_cart',
    description: 'Pobiera zawartość koszyka po cart_id.',
    parameters: {
      type: 'object',
      properties: {
        cart_id: { type: 'string' },
      },
      required: ['cart_id'],
    },
  },

  run_analytics_query: {
    name: 'run_analytics_query',
    description:
      'Wykonuje whitelistowane zapytanie analityczne (operator channel only). Wyniki z R2 SQL / Iceberg (Workers RPC do epir-bigquery-batch).',
    parameters: {
      type: 'object',
      properties: {
        queryId: {
          type: 'string',
          enum: [
            'Q1_CONVERSION_CHAT',
            'Q2_CONVERSION_PATHS',
            'Q3_TOP_CHAT_QUESTIONS',
            'Q4_STOREFRONT_SEGMENTATION',
            'Q5_TOP_PRODUCTS',
            'Q6_CHAT_ENGAGEMENT',
            'Q7_PRODUCT_TO_PURCHASE',
            'Q8_DAILY_EVENTS',
            'Q9_TOOL_USAGE',
            'Q10_SESSION_DURATION',
          ],
        },
      },
      required: ['queryId'],
    },
  },

  fetch_marketing_preview: {
    name: 'fetch_marketing_preview',
    description:
      'GA4+Ads preview z epir-marketing-ingest (/ops/marketing-preview). operator channel only.',
    parameters: {
      type: 'object',
      properties: {
        date: { type: 'string' },
      },
      required: [],
    },
  },

  get_flow_health: {
    name: 'get_flow_health',
    description:
      'EDOG flow-health: werdykt PASS/FAIL, backlog pixel, batch_exports, narrative_markdown PL. operator channel only.',
    parameters: { type: 'object', properties: {}, required: [] },
  },

  run_shopify_shopifyql: {
    name: 'run_shopify_shopifyql',
    description:
      'ShopifyQL shopifyqlQuery (read_reports), presety S1–S6; przy parseErrors — ShopifyQLPresetExecutionError, bez retry presetu w pętli.',
    parameters: {
      type: 'object',
      properties: {
        presetId: {
          type: 'string',
          enum: [
            'S1_SALES_SESSIONS_DAILY_30D',
            'S2_SALES_SESSIONS_MONTHLY_LAST_YEAR',
            'S3_SALES_NET_TOTAL_DAILY_90D',
            'S4_SALES_WEEKLY_12W',
            'S5_SALES_SESSIONS_DAILY_7D',
            'S6_SALES_MONTHLY_13M',
          ],
        },
      },
      required: ['presetId'],
    },
  },

  blender_bridge_invoke: {
    name: 'blender_bridge_invoke',
    description:
      'Blender most HTTP — 32 narzędzi MCP (w tym run_script, node_tool_invoke). Katalog: GET {BLENDER_BRIDGE_ORIGIN}/v1/tools. Krzywe CAD: curve_cutter_create.',
    parameters: {
      type: 'object',
      properties: {
        tool_name: {
          type: 'string',
          enum: blenderBridgeToolEnumForSchema(),
          description:
            'Nazwa narzędzia MCP. Krzywe/obrysy: curve_cutter_create lub alias blender_add_curve.',
        },
        arguments: { type: 'object' },
      },
      required: ['tool_name', 'arguments'],
    },
  },

  operator_shopify_admin_read: {
    name: 'operator_shopify_admin_read',
    description: 'Admin GraphQL read (whitelist presetów). operator channel only.',
    parameters: {
      type: 'object',
      properties: {
        presetId: {
          type: 'string',
          enum: [
            'A1_PRODUCTS_RECENT',
            'A2_COLLECTIONS_LIST',
            'A3_BLOG_ARTICLES_RECENT',
            'A4_PAGES_LIST',
          ],
        },
      },
      required: ['presetId'],
    },
  },

  query_d1_data: {
    name: 'query_d1_data',
    description:
      'Query D1 databases directly (pixel_events, messages) for natural language questions about user behavior and conversations.',
    parameters: {
      type: 'object',
      properties: {
        question: { type: 'string' },
        table: { type: 'string', enum: ['pixel_events', 'messages', 'both'] },
        limit: { type: 'number', minimum: 1, maximum: 100 },
      },
      required: [],
    },
  },

  update_cart: {
    name: 'update_cart',
    description: 'Aktualizuje koszyk: dodaj/zmień/usuń pozycje, buyer identity, notatka.',
    parameters: {
      type: 'object',
      additionalProperties: false,
      properties: {
        cart_id: { type: 'string' },
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
              id: { type: 'string' },
              quantity: { type: 'integer', minimum: 0 },
            },
            required: ['id', 'quantity'],
          },
        },
        remove_line_ids: {
          type: 'array',
          items: { type: 'string' },
        },
        buyer_identity: {
          type: 'object',
          additionalProperties: false,
          properties: {
            email: { type: 'string' },
            phone: { type: 'string' },
            country_code: { type: 'string' },
          },
        },
        note: { type: 'string' },
      },
    },
  },
} as const;

/**
 * Sprawdza flagę SLIM_TOOL_SCHEMAS w env (`"true"` string).
 * Defensywnie interpretujemy brak / różne warianty jako false — zachowawczo (full schemas).
 */
export function shouldUseSlimToolSchemas(env: { SLIM_TOOL_SCHEMAS?: string | boolean }): boolean {
  const raw = env.SLIM_TOOL_SCHEMAS;
  if (typeof raw === 'boolean') return raw;
  if (typeof raw !== 'string') return false;
  return raw.trim().toLowerCase() === 'true' || raw.trim() === '1';
}

/**
 * Zwraca aktywny zestaw schematów (full lub slim) w zależności od env flag.
 */
export function resolveToolSchemas(env: { SLIM_TOOL_SCHEMAS?: string | boolean }) {
  return shouldUseSlimToolSchemas(env)
    ? (TOOL_SCHEMAS_SLIM as unknown as typeof TOOL_SCHEMAS)
    : TOOL_SCHEMAS;
}

/**
 * Returns tool schemas as array for OpenAI function-calling format.
 * W pełni kompatybilne z wcześniejszym zachowaniem (full schemas) gdy env nie ma flagi.
 */
export function getToolDefinitions(env?: { SLIM_TOOL_SCHEMAS?: string | boolean }) {
  const schemas = env ? resolveToolSchemas(env) : TOOL_SCHEMAS;
  return Object.values(schemas).map((schema) => ({
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
