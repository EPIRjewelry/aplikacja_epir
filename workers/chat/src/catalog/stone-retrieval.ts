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
import {isEpirFamilyCatalogBrand, isKazkaCatalogBrand} from './kazka-assortment';
import {
  filterLivePublishedProducts,
  isLivePublishedProduct,
  type LiveCatalogChannel,
  withActiveStatusQuery,
} from './live-store-product';
import {
  applyTurnSearchHints,
  applyOriginFilterWithFallback,
  detectStoneOriginAsk,
  detectPriceCapPln,
  originAskForTurn,
  filterProductsByOriginAsk,
  isCertificateQuestion,
  isStoneOriginAssortmentQuestion,
  latestTurnSearchHints,
  originCatalogQuery,
  productMatchesOriginAsk,
  rewriteCatalogQueryForOriginAndHints,
} from './stone-origin';
import {
  buyerAsksForRing,
  detectStoneIntent,
  expandCatalogQuery,
  preferJewelryType,
  productLooksLikeFingerRing,
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

const STONE_SEARCH_LIMIT = 12;

/** Karty z audytu 2026-10-05. Drugi przebieg / dopełnienie listy szafirów. */
const AUDITED_SAPPHIRE_HANDLES = [
  'zloty-pierscionek-z-naturalnym-szafirem',
  'pierscionek-srebrny-fale-wody-z-szafirem',
  'zloty-pierscionek-z-szafirem',
  'obraczka-z-szafirem-epir-jewellery',
] as const;

/** Pierścionki Soliter z audytu GK (nie kolczyki). */
export const AUDITED_SOLITER_HANDLES = ['101-10010-3-7', '101-10019'] as const;

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

const MOISSANIT_FALSE_POSITIVE_HANDLES = new Set(['pierscionek-zloty-galazki-z-kwarcem-turmalinowym']);

function stoneTitleContradictsIntent(product: Record<string, unknown>, intent: StoneIntent): boolean {
  if (intent.id !== 'moissanit') return false;
  const title = typeof product.title === 'string' ? product.title.toLocaleLowerCase('pl-PL') : '';
  const handle = typeof product.handle === 'string' ? product.handle.toLocaleLowerCase('en-US') : '';
  const handleSaysMoissanit = /moissanit/.test(handle);
  const titleSaysMoissanit = /moissanit/.test(title);
  const titleSaysOtherGem = /ametyst|szafir|diament|brylant|rubin|szmaragd/iu.test(title);
  return handleSaysMoissanit && titleSaysOtherGem && !titleSaysMoissanit;
}

export function productMatchesStone(product: Record<string, unknown>, intent: StoneIntent): boolean {
  if (stoneTitleContradictsIntent(product, intent)) return false;
  const handle = typeof product.handle === 'string' ? product.handle.trim().toLocaleLowerCase('en-US') : '';
  if (intent.id === 'moissanit' && handle && MOISSANIT_FALSE_POSITIVE_HANDLES.has(handle)) return false;
  const hay = productHaystack(product);
  if (intent.id === 'moissanit') {
    const title = typeof product.title === 'string' ? product.title : '';
    const description = typeof product.description === 'string' ? product.description : '';
    const handle = typeof product.handle === 'string' ? product.handle : '';
    const surface = `${title}\n${description}\n${handle}`;
    return /moissanit/i.test(surface);
  }
  return textMentionsStone(hay, intent);
}

function preferAuditedSoliterFirst(products: readonly Record<string, unknown>[]): Record<string, unknown>[] {
  const byHandle = new Map<string, Record<string, unknown>>();
  for (const product of products) {
    const handle = typeof product.handle === 'string' ? product.handle : '';
    if (handle) byHandle.set(handle, product);
  }
  const preferred = AUDITED_SOLITER_HANDLES.map((handle) => byHandle.get(handle)).filter(
    (product): product is Record<string, unknown> => Boolean(product),
  );
  const rest = products.filter(
    (product) =>
      typeof product.handle !== 'string' ||
      !AUDITED_SOLITER_HANDLES.includes(product.handle as (typeof AUDITED_SOLITER_HANDLES)[number]),
  );
  return [...preferred, ...rest];
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

function moneyEdge(value: unknown): {amount: string; currencyCode: string} | undefined {
  if (!isRecord(value) || value.amount == null) return undefined;
  const amount = String(value.amount).trim();
  if (!amount) return undefined;
  const currencyCode = typeof value.currencyCode === 'string' && value.currencyCode.trim() ? value.currencyCode.trim() : 'PLN';
  return {amount, currencyCode};
}

function mapPriceRange(node: Record<string, unknown>): Record<string, unknown> | undefined {
  const raw = isRecord(node.priceRange) ? node.priceRange : isRecord(node.priceRangeV2) ? node.priceRangeV2 : null;
  if (!raw) return undefined;
  const min = moneyEdge(raw.minVariantPrice);
  const max = moneyEdge(raw.maxVariantPrice);
  if (!min && !max) return undefined;
  return {
    ...(min ? {minVariantPrice: min} : {}),
    ...(max ? {maxVariantPrice: max} : {}),
  };
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

export function mapStoreProduct(
  node: Record<string, unknown>,
  options: {kazkaStorefront?: boolean; kazkaChannel?: boolean} = {},
): Record<string, unknown> {
  const variantNodes = isRecord(node.variants) && Array.isArray(node.variants.nodes) ? node.variants.nodes : [];
  const metafields =
    isRecord(node.metafields) && Array.isArray(node.metafields.nodes) ? node.metafields.nodes : [];
  const handle = typeof node.handle === 'string' ? node.handle.trim() : '';
  const online = typeof node.onlineStoreUrl === 'string' ? node.onlineStoreUrl : undefined;
  const status = typeof node.status === 'string' ? node.status.trim().toUpperCase() : '';
  const activeOrUnknown = !status || status === 'ACTIVE';
  const kazkaChannel = options.kazkaStorefront === true || options.kazkaChannel === true;
  const kazkaUrl =
    kazkaChannel && activeOrUnknown && handle
      ? `https://kazka.epirbizuteria.pl/products/${handle}`
      : undefined;
  const mapped: Record<string, unknown> = {
    id: node.id,
    handle: node.handle,
    card_source: 'shop',
    title: node.title,
    description: node.description,
    vendor: node.vendor,
    tags: node.tags,
    status: node.status,
    onlineStoreUrl: online,
    url: kazkaUrl ?? online,
    options: mapOptions(node),
    metafields,
    variants: variantNodes.filter(isRecord).map(mapVariant),
  };
  if (options.kazkaStorefront === true) mapped.kazka_storefront = true;
  if (kazkaChannel && activeOrUnknown) mapped.kazka_channel = true;
  const priceRange = mapPriceRange(node);
  if (priceRange) mapped.priceRange = priceRange;
  return mapped;
}

const PRODUCT_FIELDS = `
  id
  handle
  title
  description
  vendor
  tags
  status
  onlineStoreUrl
  options { name optionValues { name } }
  priceRangeV2 {
    minVariantPrice { amount currencyCode }
    maxVariantPrice { amount currencyCode }
  }
  metafields(first: 20) { nodes { namespace key value } }
  variants(first: 250) {
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
        status
        onlineStoreUrl
        options { name optionValues { name } }
        priceRangeV2 {
          minVariantPrice { amount currencyCode }
          maxVariantPrice { amount currencyCode }
        }
        metafields(first: 20) { nodes { namespace key value } }
        variants(first: 250) {
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

const STOREFRONT_PRODUCT_FIELDS = `
  id
  handle
  title
  description
  vendor
  tags
  onlineStoreUrl
  options { name values }
  priceRange {
    minVariantPrice { amount currencyCode }
    maxVariantPrice { amount currencyCode }
  }
  variants(first: 250) {
    nodes {
      id
      title
      sku
      availableForSale
      price { amount currencyCode }
      selectedOptions { name value }
    }
  }
`;

const STOREFRONT_SEARCH = `
  query StoneCatalogStorefront($query: String!) {
    products(first: ${STONE_SEARCH_LIMIT}, query: $query) {
      nodes { ${STOREFRONT_PRODUCT_FIELDS} }
    }
  }
`;

const STOREFRONT_PRODUCT_BY_HANDLE = `
  query StoneCatalogStorefrontByHandle($handle: String!) {
    product(handle: $handle) { ${STOREFRONT_PRODUCT_FIELDS} }
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
  channel: LiveCatalogChannel = 'epir',
): Promise<{ok: boolean; products: Record<string, unknown>[]}> {
  const shop = env.SHOP_DOMAIN?.trim();
  const token = env.SHOPIFY_ADMIN_TOKEN?.trim();
  if (!shop || !token) return {ok: false, products: []};
  const endpoint = `https://${shop}/admin/api/${SHOPIFY_ADMIN_API_VERSION}/graphql.json`;
  const headers = {'Content-Type': 'application/json', 'X-Shopify-Access-Token': token};
  const liveQuery = withActiveStatusQuery(query);
  const mapNode = (node: Record<string, unknown>) =>
    mapStoreProduct(node, {kazkaChannel: channel === 'kazka'});
  try {
    const data = await postGraphql(endpoint, headers, ADMIN_SEARCH, {query: liveQuery});
    return {ok: true, products: filterLivePublishedProducts(nodesOf(data).map(mapNode), {channel})};
  } catch (error) {
    console.warn('[stone-retrieval] admin search with options failed', error instanceof Error ? error.message : error);
  }
  try {
    const data = await postGraphql(endpoint, headers, ADMIN_SEARCH_PLAIN_OPTIONS, {query: liveQuery});
    return {ok: true, products: filterLivePublishedProducts(nodesOf(data).map(mapNode), {channel})};
  } catch (error) {
    console.warn('[stone-retrieval] admin search failed', error instanceof Error ? error.message : error);
    return {ok: false, products: []};
  }
}

function handlesFromQuery(query: string): string[] {
  const handles: string[] = [];
  const re = /\bhandle:("?)([^\s"')]+)\1/gi;
  let match: RegExpExecArray | null;
  while ((match = re.exec(query)) != null) {
    const handle = match[2]?.trim();
    if (handle) handles.push(handle);
  }
  return [...new Set(handles)];
}

async function searchStorefrontByHandles(
  env: StoneCatalogEnv,
  handles: readonly string[],
  options: {kazka?: boolean} = {},
): Promise<{ok: boolean; products: Record<string, unknown>[]}> {
  const shop = env.SHOP_DOMAIN?.trim();
  const kazka = options.kazka === true;
  const token = kazka
    ? env.PUBLIC_STOREFRONT_API_TOKEN_KAZKA?.trim()
    : env.SHOPIFY_STOREFRONT_TOKEN?.trim();
  if (!shop || !token || !handles.length) return {ok: false, products: []};
  const endpoint = `https://${shop}/api/${SHOPIFY_STOREFRONT_API_VERSION}/graphql.json`;
  const headers = {'Content-Type': 'application/json', 'X-Shopify-Storefront-Access-Token': token};
  const channel: LiveCatalogChannel = kazka ? 'kazka' : 'epir';
  const products: Record<string, unknown>[] = [];
  let anyOk = false;
  for (const handle of handles.slice(0, STONE_SEARCH_LIMIT)) {
    try {
      const data = await postGraphql(endpoint, headers, STOREFRONT_PRODUCT_BY_HANDLE, {handle});
      anyOk = true;
      if (!isRecord(data) || !isRecord(data.product)) continue;
      const mapped = mapStoreProduct(data.product, {kazkaStorefront: kazka, kazkaChannel: kazka});
      if (isLivePublishedProduct(mapped, {channel})) products.push(mapped);
    } catch (error) {
      if (kazka) {
        console.log(
          JSON.stringify({
            tag: 'chat.kazka_storefront',
            status: 'fail',
            count: 0,
            handle,
            error: error instanceof Error ? error.message : 'unknown',
          }),
        );
      }
    }
  }
  if (kazka) {
    console.log(
      JSON.stringify({
        tag: 'chat.kazka_storefront',
        status: anyOk ? 'ok' : 'fail',
        count: products.length,
        query: `product(handle) x${handles.length}`,
      }),
    );
  }
  return {ok: anyOk, products};
}

async function searchStorefront(
  env: StoneCatalogEnv,
  query: string,
  options: {kazka?: boolean} = {},
): Promise<{ok: boolean; products: Record<string, unknown>[]}> {
  const shop = env.SHOP_DOMAIN?.trim();
  const kazka = options.kazka === true;
  const token = kazka
    ? env.PUBLIC_STOREFRONT_API_TOKEN_KAZKA?.trim()
    : env.SHOPIFY_STOREFRONT_TOKEN?.trim();
  if (!shop || !token) return {ok: false, products: []};
  const handleOnly = handlesFromQuery(query);
  // Storefront products(query:"handle:…") często ignoruje filtr — bierzemy product(handle).
  if (handleOnly.length && !query.replace(/\bhandle:("?)[^\s"')]+\1/gi, '').replace(/\bOR\b/gi, '').trim()) {
    return searchStorefrontByHandles(env, handleOnly, options);
  }
  const endpoint = `https://${shop}/api/${SHOPIFY_STOREFRONT_API_VERSION}/graphql.json`;
  const channel: LiveCatalogChannel = kazka ? 'kazka' : 'epir';
  try {
    const data = await postGraphql(
      endpoint,
      {'Content-Type': 'application/json', 'X-Shopify-Storefront-Access-Token': token},
      STOREFRONT_SEARCH,
      {query},
    );
    const products = filterLivePublishedProducts(
      nodesOf(data).map((node) => mapStoreProduct(node, {kazkaStorefront: kazka, kazkaChannel: kazka})),
      {channel},
    );
    if (kazka) {
      console.log(
        JSON.stringify({
          tag: 'chat.kazka_storefront',
          status: 'ok',
          count: products.length,
          query: query.slice(0, 80),
        }),
      );
    }
    return {ok: true, products};
  } catch (error) {
    if (kazka) {
      console.log(
        JSON.stringify({
          tag: 'chat.kazka_storefront',
          status: 'fail',
          count: 0,
          error: error instanceof Error ? error.message : 'unknown',
        }),
      );
    }
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

function shopChannel(brand?: string): LiveCatalogChannel {
  return isKazkaCatalogBrand(brand) ? 'kazka' : 'epir';
}

async function hydrateStoneCards(
  env: StoneCatalogEnv,
  products: readonly Record<string, unknown>[],
  intent: StoneIntent,
  brand?: string,
): Promise<Record<string, unknown>[]> {
  const handles = products
    .map((product) => (typeof product.handle === 'string' ? product.handle.trim() : ''))
    .filter(Boolean)
    .slice(0, STONE_SEARCH_LIMIT);
  if (!handles.length) return [];
  const query = handles.map((handle) => `handle:${handle}`).join(' OR ');
  const found = await searchShop(env, query, brand);
  if (!found.ok) return [];
  return found.products.filter((product) => productMatchesStone(product, intent));
}

export async function fetchStoreProductsByQuery(
  env: StoneCatalogEnv,
  query: string,
  brand?: string,
): Promise<{ok: boolean; products: Record<string, unknown>[]}> {
  return searchShop(env, query, brand);
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

export async function hydrateThinCatalogCards(
  result: unknown,
  env: StoneCatalogEnv,
  brand?: string,
): Promise<unknown> {
  if (!hasShopToken(env)) return result;
  const current = extractCatalogProducts(result);
  const thinHandles = current
    .filter((product) => !catalogCardIsComplete(product))
    .map((product) => (typeof product.handle === 'string' ? product.handle.trim() : ''))
    .filter(Boolean)
    .slice(0, STONE_SEARCH_LIMIT);
  if (!thinHandles.length) return result;
  const found = await searchShop(env, thinHandles.map((handle) => `handle:${handle}`).join(' OR '), brand);
  if (!found.ok || !found.products.length) return result;
  const byHandle = new Map<string, Record<string, unknown>>();
  for (const product of found.products) {
    if (typeof product.handle === 'string' && product.handle) byHandle.set(product.handle, product);
  }
  let changed = false;
  const kazkaBrand = isKazkaCatalogBrand(brand);
  const merged = current.map((product) => {
    const handle = typeof product.handle === 'string' ? product.handle : '';
    const full = handle ? byHandle.get(handle) : undefined;
    if (!full) return product;
    changed = true;
    if (!kazkaBrand) return full;
    const prevUrl = typeof product.url === 'string' ? product.url : '';
    const nextUrl =
      (typeof full.url === 'string' && full.url) ||
      prevUrl ||
      (handle ? `https://kazka.epirbizuteria.pl/products/${handle}` : '');
    return {
      ...full,
      url: nextUrl || full.url,
      kazka_storefront: full.kazka_storefront === true || product.kazka_storefront === true,
      kazka_channel: true,
    };
  });
  if (!changed) return result;
  return replaceCatalogProducts(result, merged, '');
}

async function searchShop(
  env: StoneCatalogEnv,
  query: string,
  brand?: string,
): Promise<{ok: boolean; products: Record<string, unknown>[]}> {
  if (!hasShopToken(env)) return {ok: false, products: []};
  const channel = shopChannel(brand);
  const adminToken = Boolean(env.SHOP_DOMAIN?.trim() && env.SHOPIFY_ADMIN_TOKEN?.trim());
  const kazkaStorefrontToken = Boolean(env.PUBLIC_STOREFRONT_API_TOKEN_KAZKA?.trim());
  const epirStorefrontToken = Boolean(env.SHOPIFY_STOREFRONT_TOKEN?.trim());

  if (channel === 'kazka') {
    if (!kazkaStorefrontToken) {
      console.log(JSON.stringify({tag: 'chat.kazka_storefront', status: 'missing_token', count: 0}));
    }
    if (kazkaStorefrontToken) {
      const kazka = await searchStorefront(env, query, {kazka: true});
      if (kazka.ok && kazka.products.length) return kazka;
      if (kazka.ok && !adminToken) return kazka;
      if (!kazka.ok && !adminToken) return {ok: false, products: []};
    }
    if (adminToken) return searchAdmin(env, query, 'kazka');
    return {ok: false, products: []};
  }

  if (adminToken) {
    const admin = await searchAdmin(env, query, 'epir');
    if (admin.ok && admin.products.length) return admin;
    if (admin.ok && !epirStorefrontToken) return admin;
    if (!admin.ok && !epirStorefrontToken) return {ok: false, products: []};
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
  const buyerTurns = buyerText.split('\n').map((turn) => turn.trim()).filter(Boolean);
  const latestTurn = buyerTurns[buyerTurns.length - 1] ?? buyerText;
  const originAsk = originAskForTurn(buyerTurns);
  const wantsRing = buyerAsksForRing(latestTurn) || buyerAsksForRing(buyerText);
  const baseQuery = shopifyStoneQuery(intent);
  const keyword = await searchShop(env, wantsRing ? `${baseQuery} pierścionek` : baseQuery, brand);
  if (!keyword.ok) return {products: [], confirmed: false};
  let found = keyword.products.filter((product) => productMatchesStone(product, intent));
  const explicitOrigin = Boolean(originAsk && detectStoneOriginAsk(latestTurn));
  const originApplied = applyOriginFilterWithFallback(found, originAsk, {allowFallback: !explicitOrigin});
  found = originApplied.products;
  if (wantsRing) {
    const rings = found.filter((product) => productLooksLikeRing(product));
    if (rings.length) {
      found = rings;
    } else {
      const again = await searchShop(env, ringRetryQuery(baseQuery), brand);
      found = again.ok
        ? again.products
            .filter((product) => productMatchesStone(product, intent) && productLooksLikeRing(product))
            .filter((product) => !originAsk || productMatchesOriginAsk(product, originAsk))
        : [];
    }
  }
  if (!found.length && !wantsRing && !originAsk) {
    const metafield = intent.lemmas.map((lemma) => `metafields.custom.main_stone:${lemma}`).join(' OR ');
    const byMetafield = await searchShop(env, metafield, brand);
    if (byMetafield.ok) found = byMetafield.products.filter((product) => productMatchesStone(product, intent));
  }
  if (
    intent.id === 'diament' &&
    isKazkaCatalogBrand(brand) &&
    (originAsk === 'natural' || buyerAsksForRing(latestTurn))
  ) {
    const soliterPool: Record<string, unknown>[] = [];
    for (const handle of AUDITED_SOLITER_HANDLES) {
      const byHandle = await searchShop(env, `handle:${handle}`, brand);
      if (!byHandle.ok) continue;
      for (const product of byHandle.products) {
        if (product.handle === handle) soliterPool.push(product);
      }
    }
    const soliterSearch = await searchShop(env, 'pierścionek soliter', brand);
    if (soliterSearch.ok) {
      for (const product of soliterSearch.products) {
        if (productLooksLikeFingerRing(product)) soliterPool.push(product);
      }
    }
    const soliterHits = soliterPool
      .filter((product) => productMatchesStone(product, intent))
      .filter((product) => !originAsk || productMatchesOriginAsk(product, originAsk));
    const dedup = new Map<string, Record<string, unknown>>();
    for (const product of [...soliterHits, ...found]) {
      const handle = typeof product.handle === 'string' ? product.handle : '';
      if (handle) dedup.set(handle, product);
    }
    found = preferAuditedSoliterFirst([...dedup.values()]);
  }
  if (intent.id === 'szafir' && isEpirFamilyCatalogBrand(brand)) {
    const auditedPool: Record<string, unknown>[] = [];
    for (const handle of AUDITED_SAPPHIRE_HANDLES) {
      const byHandle = await searchShop(env, `handle:${handle}`, brand);
      if (!byHandle.ok) continue;
      for (const product of byHandle.products) {
        if (typeof product.handle === 'string' && product.handle === handle) auditedPool.push(product);
      }
    }
    const audited = auditedPool
      .filter((product) => productMatchesStone(product, intent))
      .filter((product) => !originAsk || productMatchesOriginAsk(product, originAsk));
    if (audited.length) {
      const byHandleMap = new Map<string, Record<string, unknown>>();
      for (const product of [...audited, ...found]) {
        const handle = typeof product.handle === 'string' ? product.handle : '';
        if (!handle || byHandleMap.has(handle)) continue;
        byHandleMap.set(handle, product);
      }
      const preferred = AUDITED_SAPPHIRE_HANDLES.map((handle) => byHandleMap.get(handle)).filter(
        (product): product is Record<string, unknown> => Boolean(product),
      );
      const rest = [...byHandleMap.values()].filter(
        (product) =>
          typeof product.handle !== 'string' ||
          !AUDITED_SAPPHIRE_HANDLES.includes(product.handle as (typeof AUDITED_SAPPHIRE_HANDLES)[number]),
      );
      found = [...preferred, ...rest];
    }
  }
  const hints = latestTurnSearchHints(latestTurn);
  if (intent.id === 'diament' && originAsk === 'natural') {
    const finger = found.filter((product) => productLooksLikeFingerRing(product));
    if (finger.length) found = finger;
    else {
      const rings = found.filter((product) => productLooksLikeRing(product));
      if (rings.length) found = rings;
    }
  }
  found = applyTurnSearchHints(found, hints, originAsk);
  if (intent.id === 'diament' && isKazkaCatalogBrand(brand)) {
    found = preferAuditedSoliterFirst(found);
  }
  if (originApplied.originFallback && found.length) {
    console.log(
      JSON.stringify({
        tag: 'chat.catalog_funnel',
        stone: intent.id,
        brand: brand ?? null,
        origin_ask: originAsk,
        origin_fallback_to_stone_cards: true,
        stone_cards_unfiltered: originApplied.stoneCardsUnfiltered,
        final: found.length,
      }),
    );
  }
  return {products: found, confirmed: true};
}

export function catalogStoneIntent(input: StoneRescueInput): StoneIntent | null {
  if (input.allowSubstitute) return null;
  const buyerTurns = [...(input.buyerTurns ?? [])];
  const buyerLatest = buyerTurns[buyerTurns.length - 1] ?? '';
  if (isCertificateQuestion(buyerLatest)) return null;
  const namedLatest = detectStoneIntent(buyerLatest);
  if (isStoneOriginAssortmentQuestion(buyerLatest)) {
    const browseWithStone =
      namedLatest &&
      (/\b(?:pokaz|poka[zż])\b/iu.test(buyerLatest) ||
        (/\b(?:pier[sś]cion|obr[aą]cz|bransolet)\b/iu.test(buyerLatest) &&
          detectPriceCapPln(buyerLatest) != null));
    if (!browseWithStone) return null;
  }
  const turns = [...buyerTurns];
  if (input.catalogQuery?.trim()) turns.push(input.catalogQuery);
  return stoneIntentFromConversation(turns);
}

export function rewriteCatalogQueryForStone(
  query: string,
  input: Pick<StoneRescueInput, 'buyerTurns' | 'allowSubstitute'>,
): string {
  const turns = input.buyerTurns ?? [];
  const intent = catalogStoneIntent({...input, catalogQuery: query, env: {}});
  let next = intent ? expandCatalogQuery(query, intent) : query;
  next = rewriteCatalogQueryForOriginAndHints(next, turns);
  return next;
}

export async function rescueStoneCatalog(
  result: unknown,
  input: StoneRescueInput,
): Promise<{result: unknown; rescued: boolean; matchCount: number}> {
  const intent = catalogStoneIntent(input);
  if (!intent) return {result, rescued: false, matchCount: 0};
  const buyerTurns = input.buyerTurns ?? [];
  const buyerText = buyerTurns.join('\n');
  const originAsk = originAskForTurn(buyerTurns);
  const current = extractCatalogProducts(result)
    .filter((product) => productMatchesStone(product, intent))
    .filter((product) => !originAsk || productMatchesOriginAsk(product, originAsk));
  let matches = current;
  let shopLookup = false;
  if (matches.length && hasShopToken(input.env)) {
    const hydrated = await hydrateStoneCards(input.env, matches, intent, input.brand);
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
  let picked = preferJewelryType(matches, buyerText);
  if (intent.id === 'moissanit') {
    picked = picked.filter((product) => productMatchesStone(product, intent));
  }
  picked = applyTurnSearchHints(picked, latestTurnSearchHints(buyerTurns[buyerTurns.length - 1] ?? ''), originAsk);
  if (originAsk) picked = filterProductsByOriginAsk(picked, originAsk);
  const note = picked.length
    ? stoneHitNote(intent.labelPl)
    : originAsk
      ? originAsk === 'natural'
        ? `Brak trafień naturalnego kamienia „${intent.labelPl}”. Powiedz to wprost. Zaproponuj pokrewny kamień naturalny tylko jako pytanie, bez SKU syntetycznego.`
        : `Brak trafień syntetycznego albo laboratoryjnego kamienia „${intent.labelPl}”. Powiedz to wprost.`
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
