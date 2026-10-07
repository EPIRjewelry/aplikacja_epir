import type { Env } from './index';
import { callShopifyMcpTool } from './shopify-mcp-client';

// --- Typy dla parametrów i wyników narzędzi ---

export interface SearchProductParams {
  query: string;
  first?: number;
  context?: string;
}

interface PolicyParams {
  policy_types: ('termsOfService' | 'shippingPolicy' | 'refundPolicy' | 'privacyPolicy' | 'subscriptionPolicy')[];
}

interface ProductResult {
  id: string;
  title: string;
  description?: string;
  price?: string;
  currency?: string;
  url?: string;
}

interface PolicyResult {
  type: string;
  body: string;
}

// --- Implementacje narzędzi (Tools) ---

/**
 * Wyszukuje produkty w katalogu przez endpoint MCP sklepu.
 */
export async function searchProductCatalog(
  params: SearchProductParams,
  _env: Env,
): Promise<{ products: ProductResult[] }> {
  console.warn(
    '[mcp] searchProductCatalog: legacy /api/mcp catalog removed; use UCP via mcp_server (buyer path)',
    {query: params.query?.slice(0, 80)},
  );
  return { products: [] };
}

/**
 * Narz─Ödzie MCP: Pobiera polityki sklepu (regulamin, wysy┼éka itp.) za pomoc─ů Admin API.
 * @param params Parametry okre┼Ťlaj─ůce, kt├│re polityki pobra─ç.
 * @param env Zmienne ┼Ťrodowiskowe.
 * @returns Structured JSON z tre┼Ťci─ů polityk.
 */
export async function getShopPolicies(
  params: PolicyParams,
  env: Env,
): Promise<{ policies: PolicyResult[] }> {
  try {
    const query = params.policy_types.join(' ');
    const result = await callShopifyMcpTool(
      'search_shop_policies_and_faqs',
      {query},
      env as any,
    );
    if (result && typeof result === 'object') {
      return {policies: [{type: 'faq', body: JSON.stringify(result)}]};
    }
  } catch (e) {
    console.warn('getShopPolicies via MCP failed:', e);
  }
  return { policies: [] };
}

/**
 * Funkcja pomocnicza do sprawdzania, czy zapytanie użytkownika dotyczy produktu.
 * @param message Wiadomość od użytkownika.
 * @returns True, jeśli wiadomość prawdopodobnie dotyczy produktu.
 */
export function isProductQuery(message: string): boolean {
  const keywords = ['produkt', 'pierścionek', 'pierścionk', 'pierscione', 'naszyjnik', 'bransoletka', 'bransolet', 'kolczyk', 'kolczyki', 'cena', 'dostepn', 'kupi', 'znalezc', 'fair trade', 'diament', 'zlot', 'złot'];
  const lowerCaseMessage = message.toLowerCase();
  return keywords.some(keyword => lowerCaseMessage.includes(keyword));
}

/**
 * Funkcja pomocnicza do sprawdzania, czy zapytanie użytkownika dotyczy koszyka.
 * @param message Wiadomość od użytkownika.
 * @returns True, jeśli wiadomość dotyczy koszyka zakupów.
 */
export function isCartQuery(message: string): boolean {
  const keywords = ['koszyk', 'dodaj', 'usuń', 'usun', 'zamówi', 'zamowi', 'kupi', 'kupuj', 'kupuję', 'checkout', 'cart'];
  const lowerCaseMessage = message.toLowerCase();
  return keywords.some(keyword => lowerCaseMessage.includes(keyword));
}

// --- MCP wrapper functions using direct calls ---

/**
 * Search product catalog via MCP
 */
export async function mcpCatalogSearch(
  shopDomain: string,
  query: string,
  env: Env,
  context: string = 'biżuteria'
): Promise<Array<{name: string; price: string; url: string; image: string; id: string}> | null> {
  try {
    // Direct call to searchProductCatalog instead of HTTP fetch
    const result = await searchProductCatalog({ query, first: 3 }, env);
    
    if (!result || !result.products || result.products.length === 0) {
      return null;
    }

    // Normalize product format to match expected interface
    return result.products.map((p: ProductResult) => ({
      name: p.title || '',
      price: p.price || '',
      url: p.url || '',
      image: '', // ProductResult doesn't have image field currently
      id: p.id || ''
    }));
  } catch (error) {
    console.error('mcpCatalogSearch error:', error);
    return null;
  }
}
