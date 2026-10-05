/**
 * Retrieval kamienia dla czatu.
 * UCP bywa semantyczne i przy „szafir” oddaje inny kamień albo pustkę.
 * Tu zostają tylko karty, które mają kamień w tytule, tagach, opisie, metafieldzie albo wariancie.
 * Gdy UCP ich nie ma, dociągamy je ze sklepu (Admin, potem Storefront).
 */

import {
  SHOPIFY_ADMIN_API_VERSION,
  SHOPIFY_STOREFRONT_API_VERSION,
} from '../config/shopify-api-version';
import {isEpirFamilyCatalogBrand} from './kazka-assortment';
import {
  buyerAsksForRing,
  expandCatalogQuery,
  preferJewelryType,
  productLooksLikeRing,
  ringRetryQuery,
  shopifyStoneQuery,
  stoneIntentFromConversation,
  textMentionsStone,
  type StoneIntent,
} from './stone-intent';

export type StoneCatalogEnv = {
  SHOP_DOMAIN?: string;
  SHOPIFY_ADMIN_TOKEN?: string;
  SHOPIFY_STOREFRONT_TOKEN?: string;
  PUBLIC_STOREFRONT_API_TOKEN_KAZKA?: string;
};

export type StoneRescueInput = {
  buyerTurns?: readonly string[];
  catalogQuery?: string;
  allowSubstitute?: boolean;
  brand?: string;
  env: StoneCatalogEnv;
};

const STONE_SEARCH_LIMIT = 8;

/** Karty z audytu 2026-10-05. Drugi przebieg, gdy wyszukiwanie po słowie nic nie odda. */
const AUDITED_SAPPHIRE_HANDLES = [
  'obraczka-z-szafirem-epir-jewellery',
  'pierscionek-srebrny-fale-wody-z-szafirem',
  'zloty-pierscionek-z-naturalnym-szafirem',
] as const;

export function stoneHitNote(label: string): string {
  return `Trafienia kamienia „${label}” są w products. To jest oferta tej marki. Pokaż 2–4 pozycje: nazwa, cena z price_display_pl, jedna cecha z karty, link z url. Nie pisz, że kamienia nie ma. Nie proponuj innego kamienia bez jawnej zgody. Przy „pokaż kilka” najpierw lista, potem jedno pytanie.`;
}

export function stoneMissNote(label: string): string {
  return `Brak trafień kamienia „${label}” w katalogu tej marki. Powiedz wprost, że teraz go nie ma. Inny kamień tylko jako pytanie o zgodę, bez SKU, bez ceny i bez dodania do koszyka.`;
}

export function stoneUnconfirmedNote(label: string): string {
  return `Nie udało się potwierdzić kamienia „${label}” w sklepie. Nie pisz, że oferty nie ma, i nie proponuj innego kamienia. Poproś klienta, żeby napisał jeszcze raz.`;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function collectStrings(value: unknown, depth: number, into: string[]): void {
  if (depth < 0 || value == null) return;
  if (typeof value === 'string') {
    into.push(value);
    return;
  }
  if (Array.isArray(value)) {
    for (const item of value) collectStrings(item, depth - 1, into);
    return;
  }
  if (!isRecord(value)) return;
  for (const [key, child] of Object.entries(value)) {
    if (key === 'media' || key === 'id' || key === 'sku') continue;
    collectStrings(child, depth - 1, into);
  }
}

export function productHaystack(product: Record<string, unknown>): string {
  const parts: string[] = [];
  collectStrings(product, 6, parts);
  return parts.join('\n');
}

export function productMatchesStone(product: Record<string, unknown>, intent: StoneIntent): boolean {
  return textMentionsStone(productHaystack(product), intent);
}

function parseCatalogBody(text: string): unknown | null {
  const trimmed = text.trim();
  if (!trimmed.startsWith('{') && !trimmed.startsWith('[')) return null;
  try {
    return JSON.parse(trimmed) as unknown;
  } catch {
    return null;
  }
}

function pushProducts(body: unknown, into: Record<string, unknown>[]): void {
  if (!isRecord(body)) return;
  for (const key of ['products', 'items', 'results'] as const) {
    const list = body[key];
    if (!Array.isArray(list)) continue;
    for (const item of list) {
      if (isRecord(item)) into.push(item);
    }
  }
  if (isRecord(body.catalog) && Array.isArray(body.catalog.products)) {
    for (const item of body.catalog.products) {
      if (isRecord(item)) into.push(item);
    }
  }
  if (isRecord(body.product)) into.push(body.product);
}

export function extractCatalogProducts(result: unknown): Record<string, unknown>[] {
  const into: Record<string, unknown>[] = [];
  if (!isRecord(result)) return into;
  if (Array.isArray(result.content)) {
    for (const entry of result.content) {
      if (!isRecord(entry) || typeof entry.text !== 'string') continue;
      const parsed = parseCatalogBody(entry.text);
      if (parsed) pushProducts(parsed, into);
    }
  }
  if (into.length) return dedupeProducts(into);
  if (isRecord(result.structuredContent)) pushProducts(result.structuredContent, into);
  if (into.length) return dedupeProducts(into);
  pushProducts(result, into);
  return dedupeProducts(into);
}

function dedupeProducts(products: Record<string, unknown>[]): Record<string, unknown>[] {
  const seen = new Set<string>();
  const out: Record<string, unknown>[] = [];
  for (const product of products) {
    const handle = typeof product.handle === 'string' ? product.handle : '';
    const id = typeof product.id === 'string' ? product.id : '';
    const title = typeof product.title === 'string' ? product.title : '';
    const key = handle || id || title;
    if (!key || seen.has(key)) continue;
    seen.add(key);
    out.push(product);
  }
  return out;
}

function stampBody(body: unknown, products: Record<string, unknown>[], note: string): unknown {
  if (!isRecord(body)) return {products, system_note: note};
  const out: Record<string, unknown> = {...body};
  let stamped = false;
  for (const key of ['products', 'items', 'results'] as const) {
    if (Array.isArray(out[key])) {
      out[key] = products;
      stamped = true;
    }
  }
  if (isRecord(out.catalog) && Array.isArray(out.catalog.products)) {
    out.catalog = {...out.catalog, products};
    stamped = true;
  }
  if (!stamped) out.products = products;
  const previous = typeof out.system_note === 'string' ? out.system_note.trim() : '';
  const keptPrevious = /chwilowo niedostępny|Connection Timeout/i.test(previous) ? '' : previous;
  const trimmedNote = note.trim();
  out.system_note = keptPrevious && trimmedNote ? `${keptPrevious} ${trimmedNote}` : keptPrevious || trimmedNote;
  return out;
}

export function replaceCatalogProducts(
  result: unknown,
  products: Record<string, unknown>[],
  note: string,
): unknown {
  if (!isRecord(result)) return {products, system_note: note};
  const next: Record<string, unknown> = {...result};
  let stampedContent = false;
  if (Array.isArray(result.content)) {
    next.content = result.content.map((entry) => {
      if (!isRecord(entry) || typeof entry.text !== 'string') return entry;
      const parsed = parseCatalogBody(entry.text);
      if (!parsed) return entry;
      stampedContent = true;
      return {...entry, text: JSON.stringify(stampBody(parsed, products, note))};
    });
  }
  if (isRecord(result.structuredContent)) {
    next.structuredContent = stampBody(result.structuredContent, products, note);
    stampedContent = true;
  }
  if (Array.isArray(result.products) || Array.isArray(result.items) || Array.isArray(result.results)) {
    return stampBody(next, products, note);
  }
  if (!stampedContent) {
    next.content = [{type: 'text', text: JSON.stringify({products, system_note: note})}];
  }
  return next;
}

function decimalPrice(price: unknown): string | undefined {
  if (typeof price === 'number' && Number.isFinite(price) && price > 0) return price.toFixed(2);
  if (typeof price !== 'string' || !price.trim()) return undefined;
  const parsed = Number(price.trim().replace(/\s/g, '').replace(',', '.'));
  if (!Number.isFinite(parsed) || parsed <= 0) return undefined;
  return parsed.toFixed(2);
}

function mapVariant(node: Record<string, unknown>): Record<string, unknown> {
  const price = isRecord(node.price)
    ? node.price
    : decimalPrice(node.price)
      ? {amount: decimalPrice(node.price), currencyCode: 'PLN'}
      : undefined;
  const metafields = isRecord(node.metafields) && Array.isArray(node.metafields.nodes) ? node.metafields.nodes : node.metafields;
  return {
    id: node.id,
    title: node.title,
    sku: node.sku,
    availableForSale: node.availableForSale,
    available: node.availableForSale,
    price,
    selectedOptions: node.selectedOptions,
    metafields,
  };
}

function mapOptions(node: Record<string, unknown>): Array<{name: string; values: string[]}> {
  if (!Array.isArray(node.options)) return [];
  const groups: Array<{name: string; values: string[]}> = [];
  for (const option of node.options) {
    if (!isRecord(option) || typeof option.name !== 'string') continue;
    const values: string[] = [];
    if (Array.isArray(option.values)) {
      for (const value of option.values) {
        if (typeof value === 'string') values.push(value);
        else if (isRecord(value) && typeof value.name === 'string') values.push(value.name);
      }
    }
    if (Array.isArray(option.optionValues)) {
      for (const value of option.optionValues) {
        if (isRecord(value) && typeof value.name === 'string') values.push(value.name);
      }
    }
    if (values.length) groups.push({name: option.name, values});
  }
  return groups;
}

export function mapStoreProduct(node: Record<string, unknown>): Record<string, unknown> {
  const variantNodes = isRecord(node.variants) && Array.isArray(node.variants.nodes) ? node.variants.nodes : [];
  const metafields =
    isRecord(node.metafields) && Array.isArray(node.metafields.nodes) ? node.metafields.nodes : [];
  const online = typeof node.onlineStoreUrl === 'string' ? node.onlineStoreUrl : undefined;
  return {
    id: node.id,
    handle: node.handle,
    card_source: 'shop',
    title: node.title,
    description: node.description,
    vendor: node.vendor,
    tags: node.tags,
    onlineStoreUrl: online,
    url: online,
    options: mapOptions(node),
    metafields,
    variants: variantNodes.filter(isRecord).map(mapVariant),
  };
}

const PRODUCT_FIELDS = `
  id
  handle
  title
  description
  vendor
  tags
  onlineStoreUrl
  options { name optionValues { name } }
  metafields(first: 20) { nodes { namespace key value } }
  variants(first: 100) {
    nodes {
      id
      title
      sku
      availableForSale
      price
      selectedOptions { name value }
      metafields(first: 8) { nodes { namespace key value } }
    }
  }
`;

const ADMIN_SEARCH = `
  query StoneCatalogSearch($query: String!) {
    products(first: ${STONE_SEARCH_LIMIT}, query: $query) {
      nodes { ${PRODUCT_FIELDS} }
    }
  }
`;

const ADMIN_SEARCH_PLAIN_OPTIONS = `
  query StoneCatalogSearchPlain($query: String!) {
    products(first: ${STONE_SEARCH_LIMIT}, query: $query) {
      nodes {
        id
        handle
        title
        description
        vendor
        tags
        onlineStoreUrl
        metafields(first: 20) { nodes { namespace key value } }
        variants(first: 100) {
          nodes {
            id
            title
            sku
            availableForSale
            price
            selectedOptions { name value }
          }
        }
      }
    }
  }
`;

const STOREFRONT_SEARCH = `
  query StoneCatalogStorefront($query: String!) {
    products(first: ${STONE_SEARCH_LIMIT}, query: $query) {
      nodes {
        id
        handle
        title
        description
        vendor
        tags
        onlineStoreUrl
        options { name values }
        variants(first: 100) {
          nodes {
            id
            title
            sku
            availableForSale
            price { amount currencyCode }
            selectedOptions { name value }
          }
        }
      }
    }
  }
`;

async function postGraphql(
  endpoint: string,
  headers: Record<string, string>,
  query: string,
  variables: Record<string, unknown>,
): Promise<unknown> {
  const response = await fetch(endpoint, {
    method: 'POST',
    headers,
    body: JSON.stringify({query, variables}),
    signal: AbortSignal.timeout(4000),
  });
  if (!response.ok) throw new Error(`shop graphql ${response.status}`);
  const payload = (await response.json()) as {data?: unknown; errors?: unknown};
  if (payload.errors) throw new Error('shop graphql errors');
  return payload.data;
}

function nodesOf(data: unknown): Record<string, unknown>[] {
  if (!isRecord(data) || !isRecord(data.products) || !Array.isArray(data.products.nodes)) return [];
  return data.products.nodes.filter(isRecord);
}

async function searchAdmin(
  env: StoneCatalogEnv,
  query: string,
): Promise<{ok: boolean; products: Record<string, unknown>[]}> {
  const shop = env.SHOP_DOMAIN?.trim();
  const token = env.SHOPIFY_ADMIN_TOKEN?.trim();
  if (!shop || !token) return {ok: false, products: []};
  const endpoint = `https://${shop}/admin/api/${SHOPIFY_ADMIN_API_VERSION}/graphql.json`;
  const headers = {'Content-Type': 'application/json', 'X-Shopify-Access-Token': token};
  try {
    const data = await postGraphql(endpoint, headers, ADMIN_SEARCH, {query});
    return {ok: true, products: nodesOf(data).map(mapStoreProduct)};
  } catch (error) {
    console.warn('[stone-retrieval] admin search with options failed', error instanceof Error ? error.message : error);
  }
  try {
    const data = await postGraphql(endpoint, headers, ADMIN_SEARCH_PLAIN_OPTIONS, {query});
    return {ok: true, products: nodesOf(data).map(mapStoreProduct)};
  } catch (error) {
    console.warn('[stone-retrieval] admin search failed', error instanceof Error ? error.message : error);
    return {ok: false, products: []};
  }
}

async function searchStorefront(
  env: StoneCatalogEnv,
  query: string,
): Promise<{ok: boolean; products: Record<string, unknown>[]}> {
  const shop = env.SHOP_DOMAIN?.trim();
  const token = env.SHOPIFY_STOREFRONT_TOKEN?.trim() || env.PUBLIC_STOREFRONT_API_TOKEN_KAZKA?.trim();
  if (!shop || !token) return {ok: false, products: []};
  const endpoint = `https://${shop}/api/${SHOPIFY_STOREFRONT_API_VERSION}/graphql.json`;
  try {
    const data = await postGraphql(
      endpoint,
      {'Content-Type': 'application/json', 'X-Shopify-Storefront-Access-Token': token},
      STOREFRONT_SEARCH,
      {query},
    );
    return {ok: true, products: nodesOf(data).map(mapStoreProduct)};
  } catch (error) {
    console.warn('[stone-retrieval] storefront search failed', error instanceof Error ? error.message : error);
    return {ok: false, products: []};
  }
}

function hasShopToken(env: StoneCatalogEnv): boolean {
  return Boolean(
    (env.SHOP_DOMAIN?.trim() && env.SHOPIFY_ADMIN_TOKEN?.trim()) ||
      env.SHOPIFY_STOREFRONT_TOKEN?.trim() ||
      env.PUBLIC_STOREFRONT_API_TOKEN_KAZKA?.trim(),
  );
}

async function hydrateStoneCards(
  env: StoneCatalogEnv,
  products: readonly Record<string, unknown>[],
  intent: StoneIntent,
): Promise<Record<string, unknown>[]> {
  const handles = products
    .map((product) => (typeof product.handle === 'string' ? product.handle.trim() : ''))
    .filter(Boolean)
    .slice(0, STONE_SEARCH_LIMIT);
  if (!handles.length) return [];
  const query = handles.map((handle) => `handle:${handle}`).join(' OR ');
  const found = await searchShop(env, query);
  if (!found.ok) return [];
  return found.products.filter((product) => productMatchesStone(product, intent));
}

export async function fetchStoreProductsByQuery(
  env: StoneCatalogEnv,
  query: string,
): Promise<{ok: boolean; products: Record<string, unknown>[]}> {
  return searchShop(env, query);
}

function variantRecords(product: Record<string, unknown>): Record<string, unknown>[] {
  const variants = product.variants;
  if (Array.isArray(variants)) return variants.filter(isRecord);
  if (isRecord(variants) && Array.isArray(variants.nodes)) return variants.nodes.filter(isRecord);
  return [];
}

function sizeOptionCount(product: Record<string, unknown>): number {
  if (!Array.isArray(product.options)) return 0;
  for (const option of product.options) {
    if (!isRecord(option) || typeof option.name !== 'string') continue;
    if (!/rozmiar|size|wielko/i.test(option.name)) continue;
    if (Array.isArray(option.values)) return option.values.length;
    if (Array.isArray(option.optionValues)) return option.optionValues.length;
  }
  return 0;
}

function variantHasPrice(variant: Record<string, unknown>): boolean {
  const price = variant.price;
  if (typeof price === 'string' || typeof price === 'number') return true;
  if (!isRecord(price)) return typeof variant.price_display_pl === 'string';
  return price.amount != null || typeof price.price_display_pl === 'string';
}

/**
 * Karta ze sklepu ma wszystkie warianty. Karta UCP z osią rozmiaru jest cienka,
 * dopóki nie dociągniemy jej po handle. Produkt bez rozmiaru zostaje jak przyszedł.
 */
export function catalogCardIsComplete(product: Record<string, unknown>): boolean {
  if (product.card_source === 'shop') return true;
  const variants = variantRecords(product);
  if (!variants.length || !variants.every(variantHasPrice)) return false;
  if (sizeOptionCount(product) > 0) return false;
  return true;
}

export async function hydrateThinCatalogCards(result: unknown, env: StoneCatalogEnv): Promise<unknown> {
  if (!hasShopToken(env)) return result;
  const current = extractCatalogProducts(result);
  const thinHandles = current
    .filter((product) => !catalogCardIsComplete(product))
    .map((product) => (typeof product.handle === 'string' ? product.handle.trim() : ''))
    .filter(Boolean)
    .slice(0, STONE_SEARCH_LIMIT);
  if (!thinHandles.length) return result;
  const found = await searchShop(env, thinHandles.map((handle) => `handle:${handle}`).join(' OR '));
  if (!found.ok || !found.products.length) return result;
  const byHandle = new Map<string, Record<string, unknown>>();
  for (const product of found.products) {
    if (typeof product.handle === 'string' && product.handle) byHandle.set(product.handle, product);
  }
  let changed = false;
  const merged = current.map((product) => {
    const handle = typeof product.handle === 'string' ? product.handle : '';
    const full = handle ? byHandle.get(handle) : undefined;
    if (!full) return product;
    changed = true;
    return full;
  });
  if (!changed) return result;
  return replaceCatalogProducts(result, merged, '');
}

async function searchShop(env: StoneCatalogEnv, query: string): Promise<{ok: boolean; products: Record<string, unknown>[]}> {
  if (!hasShopToken(env)) return {ok: false, products: []};
  const adminToken = Boolean(env.SHOP_DOMAIN?.trim() && env.SHOPIFY_ADMIN_TOKEN?.trim());
  const storefrontToken = Boolean(
    env.SHOPIFY_STOREFRONT_TOKEN?.trim() || env.PUBLIC_STOREFRONT_API_TOKEN_KAZKA?.trim(),
  );
  if (adminToken) {
    const admin = await searchAdmin(env, query);
    if (admin.ok && admin.products.length) return admin;
    if (admin.ok && !storefrontToken) return admin;
    if (!admin.ok && !storefrontToken) return {ok: false, products: []};
  }
  return searchStorefront(env, query);
}

export async function fetchStoneProducts(
  env: StoneCatalogEnv,
  intent: StoneIntent,
  brand: string | undefined,
  buyerText = '',
): Promise<{products: Record<string, unknown>[]; confirmed: boolean}> {
  if (!hasShopToken(env)) return {products: [], confirmed: false};
  const wantsRing = buyerAsksForRing(buyerText);
  const keyword = await searchShop(env, wantsRing ? `${shopifyStoneQuery(intent)} pierścionek` : shopifyStoneQuery(intent));
  if (!keyword.ok) return {products: [], confirmed: false};
  let found = keyword.products.filter((product) => productMatchesStone(product, intent));
  if (wantsRing) {
    const rings = found.filter((product) => productLooksLikeRing(product));
    if (rings.length) {
      found = rings;
    } else {
      const again = await searchShop(env, ringRetryQuery(shopifyStoneQuery(intent)));
      found = again.ok
        ? again.products.filter((product) => productMatchesStone(product, intent) && productLooksLikeRing(product))
        : [];
    }
  }
  if (!found.length && !wantsRing) {
    const metafield = intent.lemmas.map((lemma) => `metafields.custom.main_stone:${lemma}`).join(' OR ');
    const byMetafield = await searchShop(env, metafield);
    if (byMetafield.ok) found = byMetafield.products.filter((product) => productMatchesStone(product, intent));
  }
  if (!found.length && intent.id === 'szafir' && isEpirFamilyCatalogBrand(brand)) {
    const handles = AUDITED_SAPPHIRE_HANDLES.map((handle) => `handle:${handle}`).join(' OR ');
    const byHandle = await searchShop(env, handles);
    if (byHandle.ok) found = byHandle.products.filter((product) => productMatchesStone(product, intent));
  }
  return {products: found, confirmed: true};
}

export function catalogStoneIntent(input: StoneRescueInput): StoneIntent | null {
  if (input.allowSubstitute) return null;
  const turns = [...(input.buyerTurns ?? [])];
  if (input.catalogQuery?.trim()) turns.push(input.catalogQuery);
  return stoneIntentFromConversation(turns);
}

export function rewriteCatalogQueryForStone(
  query: string,
  input: Pick<StoneRescueInput, 'buyerTurns' | 'allowSubstitute'>,
): string {
  const intent = catalogStoneIntent({...input, catalogQuery: query, env: {}});
  if (!intent) return query;
  return expandCatalogQuery(query, intent);
}

export async function rescueStoneCatalog(
  result: unknown,
  input: StoneRescueInput,
): Promise<{result: unknown; rescued: boolean; matchCount: number}> {
  const intent = catalogStoneIntent(input);
  if (!intent) return {result, rescued: false, matchCount: 0};
  const buyerText = (input.buyerTurns ?? []).join('\n');
  const current = extractCatalogProducts(result).filter((product) => productMatchesStone(product, intent));
  let matches = current;
  let shopLookup = false;
  if (matches.length && hasShopToken(input.env)) {
    const hydrated = await hydrateStoneCards(input.env, matches, intent);
    if (hydrated.length) matches = hydrated;
  }
  if (matches.length && buyerAsksForRing(buyerText)) {
    const rings = matches.filter((product) => productLooksLikeRing(product));
    matches = rings;
  }
  if (!matches.length) {
    const found = await fetchStoneProducts(input.env, intent, input.brand, buyerText);
    shopLookup = true;
    if (!found.confirmed) {
      console.log(
        JSON.stringify({
          tag: 'chat.stone_retrieval',
          stone: intent.id,
          brand: input.brand ?? null,
          ucpMatches: current.length,
          kept: 0,
          shopLookup: true,
          confirmed: false,
        }),
      );
      return {
        result: replaceCatalogProducts(result, [], stoneUnconfirmedNote(intent.labelPl)),
        rescued: true,
        matchCount: 0,
      };
    }
    matches = found.products;
  }
  const picked = preferJewelryType(matches, buyerText);
  const note = picked.length
    ? stoneHitNote(intent.labelPl)
    : buyerAsksForRing(buyerText)
      ? `Brak pierścionków z kamieniem „${intent.labelPl}” w katalogu tej marki. Nie proponuj naszyjnika Iluzja.`
      : stoneMissNote(intent.labelPl);
  console.log(
    JSON.stringify({
      tag: 'chat.stone_retrieval',
      stone: intent.id,
      brand: input.brand ?? null,
      ucpMatches: current.length,
      kept: picked.length,
      shopLookup,
    }),
  );
  return {
    result: replaceCatalogProducts(result, picked, note),
    rescued: true,
    matchCount: picked.length,
  };
}

export const STONE_CATALOG_CANDIDATES = STONE_SEARCH_LIMIT;
