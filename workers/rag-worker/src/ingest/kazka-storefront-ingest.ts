import type {AIBinding, VectorizeIndex} from '../services/vectorize';
import {upsertDocuments} from '../services/vectorize';
import {parseCollectionFilter, unionCollectionsByHandle} from './collection-filter';
import {
  fetchAllProductsInCollection,
  fetchCollectionByHandle,
  fetchCollectionsByTag,
  type KazkaCollectionNode,
  type KazkaProductNode,
} from './storefront-client';

export type KazkaIngestEnv = {
  SHOP_DOMAIN?: string;
  PUBLIC_STOREFRONT_API_TOKEN_KAZKA?: string;
  /** Fallback — ten sam token co w chat worker (docs: opcja A). */
  SHOPIFY_STOREFRONT_TOKEN?: string;
  KAZKA_COLLECTION_FILTER?: string;
  VECTOR_INDEX?: VectorizeIndex;
  AI?: AIBinding;
};

function resolveKazkaStorefrontToken(env: KazkaIngestEnv): string {
  return (
    env.PUBLIC_STOREFRONT_API_TOKEN_KAZKA?.trim() ??
    env.SHOPIFY_STOREFRONT_TOKEN?.trim() ??
    ''
  );
}

export type KazkaVectorDoc = {
  id: string;
  text: string;
  metadata: Record<string, string>;
};

export type KazkaIngestResult = {
  collections: number;
  products: number;
  documents: number;
  warnings: string[];
};

function stripHtml(html: string | null | undefined): string {
  if (!html?.trim()) return '';
  return html
    .replace(/<[^>]+>/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

export function buildCollectionDoc(collection: KazkaCollectionNode): KazkaVectorDoc {
  const text = [collection.title, collection.description?.trim() ?? '']
    .filter(Boolean)
    .join('\n');
  return {
    id: `kazka:collection:${collection.handle}`,
    text,
    metadata: {
      brand: 'kazka',
      channel: 'kazka_headless',
      type: 'collection',
      collectionId: collection.id,
      collectionHandle: collection.handle,
      title: collection.title,
      text,
      updatedAt: collection.updatedAt ?? '',
    },
  };
}

export function buildProductDoc(product: KazkaProductNode, collectionHandle: string): KazkaVectorDoc {
  const plainDescription =
    product.description?.trim() || stripHtml(product.descriptionHtml);
  const tags = (product.tags ?? []).join(', ');
  const options =
    product.options
      ?.filter((o) => o.values?.length)
      .map((o) => `${o.name}: ${o.values.join(', ')}`)
      .join('; ') ?? '';
  const text = [
    product.title,
    plainDescription,
    tags ? `Tagi: ${tags}` : '',
    product.productType ? `Typ: ${product.productType}` : '',
    product.vendor ? `Vendor: ${product.vendor}` : '',
    options ? `Opcje: ${options}` : '',
    `Kolekcja: ${collectionHandle}`,
  ]
    .filter(Boolean)
    .join('\n');

  const imageUrls =
    product.images?.nodes
      ?.slice(0, 3)
      .map((img) => img.url)
      .join(', ') ?? '';

  return {
    id: `kazka:product:${product.handle}`,
    text,
    metadata: {
      brand: 'kazka',
      channel: 'kazka_headless',
      type: 'product',
      productId: product.id,
      productHandle: product.handle,
      collectionHandle,
      title: product.title,
      text,
      tags,
      productType: product.productType ?? '',
      vendor: product.vendor ?? '',
      imageUrls,
      updatedAt: product.updatedAt ?? '',
    },
  };
}

export async function resolveKazkaCollections(
  env: KazkaIngestEnv,
): Promise<{collections: KazkaCollectionNode[]; warnings: string[]}> {
  const shopDomain = env.SHOP_DOMAIN?.trim();
  const token = resolveKazkaStorefrontToken(env);
  if (!shopDomain || !token) {
    throw new Error('Kazka ingest: missing SHOP_DOMAIN or Storefront token (KAZKA / SHOPIFY_STOREFRONT_TOKEN)');
  }

  const warnings: string[] = [];
  const configHandles = parseCollectionFilter(env.KAZKA_COLLECTION_FILTER);

  const tagged = await fetchCollectionsByTag(shopDomain, token, 'tag:kazka');
  const taggedHandles = new Set(tagged.map((c) => c.handle));

  let configCollections: KazkaCollectionNode[] = [];
  if (configHandles.length) {
    const fetched = await Promise.all(
      configHandles.map((handle) => fetchCollectionByHandle(shopDomain, token, handle)),
    );
    configCollections = fetched.filter((c): c is KazkaCollectionNode => Boolean(c));
    for (const handle of configHandles) {
      if (!configCollections.some((c) => c.handle === handle)) {
        warnings.push(`config handle not found in Storefront: ${handle}`);
      }
    }
    for (const col of configCollections) {
      if (!taggedHandles.has(col.handle)) {
        warnings.push(`collection "${col.handle}" missing tag:kazka (ingested via config rail)`);
      }
    }
  }

  let collections: KazkaCollectionNode[];
  if (tagged.length === 0 && configCollections.length > 0) {
    collections = configCollections;
    warnings.push('tag:kazka returned empty — using KAZKA_COLLECTION_FILTER fallback');
  } else if (tagged.length > 0) {
    collections = unionCollectionsByHandle(tagged, configCollections);
  } else {
    collections = [];
  }

  return {collections, warnings};
}

export async function buildKazkaIngestDocuments(env: KazkaIngestEnv): Promise<{
  docs: KazkaVectorDoc[];
  result: KazkaIngestResult;
}> {
  const shopDomain = env.SHOP_DOMAIN?.trim();
  const token = resolveKazkaStorefrontToken(env);
  if (!shopDomain || !token) {
    throw new Error('Kazka ingest: missing SHOP_DOMAIN or Storefront token (KAZKA / SHOPIFY_STOREFRONT_TOKEN)');
  }

  const {collections, warnings} = await resolveKazkaCollections(env);
  const docs: KazkaVectorDoc[] = [];
  let productCount = 0;

  for (const collection of collections) {
    docs.push(buildCollectionDoc(collection));
    const products = await fetchAllProductsInCollection(shopDomain, token, collection.handle);
    productCount += products.length;
    for (const product of products) {
      docs.push(buildProductDoc(product, collection.handle));
    }
  }

  return {
    docs,
    result: {
      collections: collections.length,
      products: productCount,
      documents: docs.length,
      warnings,
    },
  };
}

const UPSERT_BATCH = 20;

export async function runKazkaIngest(env: KazkaIngestEnv): Promise<KazkaIngestResult> {
  if (!env.VECTOR_INDEX || !env.AI) {
    throw new Error('Kazka ingest: VECTOR_INDEX and AI bindings required');
  }

  const {docs, result} = await buildKazkaIngestDocuments(env);
  for (let i = 0; i < docs.length; i += UPSERT_BATCH) {
    const batch = docs.slice(i, i + UPSERT_BATCH);
    await upsertDocuments(
      batch.map((d) => ({id: d.id, text: d.text, metadata: d.metadata})),
      env.VECTOR_INDEX,
      env.AI,
    );
  }

  console.log(
    JSON.stringify({
      tag: 'kazka.ingest.complete',
      ...result,
    }),
  );

  return result;
}
