/**
 * Admin GraphQL — zapis campaign landingów i mappingu UTM.
 * Używa SHOPIFY_ADMIN_TOKEN z workers/chat (nie wystawiać z Hydrogen).
 */

import {adminGraphql, type ShopifyEnv} from '../utils/shopify-graphql';

export const CAMPAIGN_LANDING_TYPE = '$app:campaign_landing';
/**
 * Storefront / Admin reserved type for app-owned campaign_landing
 * (Asystent Klienta custom app — token w .dev.vars).
 * Partner TOML epir_ai używa `$app:campaign_landing` → app--315799732225--…
 * Seed + Hydrogen odczyt używają tego reserved type, dopóki seed nie idzie tokenem epir_ai.
 */
export const CAMPAIGN_LANDING_TYPE_RESERVED =
  'app--280344821761--campaign_landing';
export const CAMPAIGN_MAPPING_NAMESPACE = 'app';
export const CAMPAIGN_MAPPING_KEY = 'campaign_mapping';

export type CampaignMapping = Record<string, string>;

export type CampaignLandingInput = {
  handle: string;
  heroTitle: string;
  heroSubtitle?: string;
  productIds?: string[];
  ctaLabel?: string;
  ctaUrl?: string;
};

const SHOP_ID_QUERY = `#graphql
  query CampaignLandingShopId {
    shop {
      id
    }
  }
`;

const METAFIELDS_SET_MUTATION = `#graphql
  mutation CampaignMappingMetafieldsSet($metafields: [MetafieldsSetInput!]!) {
    metafieldsSet(metafields: $metafields) {
      metafields {
        id
        key
        namespace
      }
      userErrors {
        field
        message
        code
      }
    }
  }
`;

const METAOBJECT_UPSERT_MUTATION = `#graphql
  mutation CampaignLandingMetaobjectUpsert(
    $handle: MetaobjectHandleInput!
    $metaobject: MetaobjectUpsertInput!
  ) {
    metaobjectUpsert(handle: $handle, metaobject: $metaobject) {
      metaobject {
        id
        handle
      }
      userErrors {
        field
        message
        code
      }
    }
  }
`;

const PRODUCTS_BY_IDS_QUERY = `#graphql
  query CampaignLandingValidateProductIds($ids: [ID!]!) {
    nodes(ids: $ids) {
      ... on Product {
        id
      }
    }
  }
`;

function isProductGid(id: string): boolean {
  return id.startsWith('gid://shopify/Product/');
}

/**
 * Sprawdza, że wszystkie GID-y istnieją jako Product w katalogu Admin API.
 * Zwraca listę brakujących / niepoprawnych ID.
 */
export async function validateProductGids(
  env: ShopifyEnv,
  productIds: string[],
): Promise<{valid: string[]; missing: string[]}> {
  const unique = [...new Set(productIds.map((id) => id.trim()).filter(Boolean))];
  if (unique.length === 0) {
    return {valid: [], missing: []};
  }

  const malformed = unique.filter((id) => !isProductGid(id));
  const gids = unique.filter(isProductGid);

  if (gids.length === 0) {
    return {valid: [], missing: malformed};
  }

  const data = await adminGraphql<{
    nodes: Array<{id?: string} | null>;
  }>(env, PRODUCTS_BY_IDS_QUERY, {ids: gids});

  const found = new Set(
    (data.nodes ?? [])
      .filter((node): node is {id: string} => Boolean(node?.id))
      .map((node) => node.id),
  );

  const missingFromCatalog = gids.filter((id) => !found.has(id));
  return {
    valid: gids.filter((id) => found.has(id)),
    missing: [...malformed, ...missingFromCatalog],
  };
}

export async function getShopId(env: ShopifyEnv): Promise<string> {
  const data = await adminGraphql<{shop: {id: string}}>(env, SHOP_ID_QUERY);
  const id = data.shop?.id?.trim();
  if (!id) {
    throw new Error('Campaign landing: shop.id missing from Admin API');
  }
  return id;
}

export async function setCampaignMapping(
  env: ShopifyEnv,
  mapping: CampaignMapping,
): Promise<void> {
  const shopId = await getShopId(env);
  const data = await adminGraphql<{
    metafieldsSet: {
      userErrors: {field: string[]; message: string; code?: string}[];
    };
  }>(env, METAFIELDS_SET_MUTATION, {
    metafields: [
      {
        ownerId: shopId,
        namespace: CAMPAIGN_MAPPING_NAMESPACE,
        key: CAMPAIGN_MAPPING_KEY,
        type: 'json',
        value: JSON.stringify(mapping),
      },
    ],
  });

  const errors = data.metafieldsSet?.userErrors ?? [];
  if (errors.length > 0) {
    throw new Error(
      `metafieldsSet failed: ${errors.map((e) => e.message).join('; ')}`,
    );
  }
}

function landingFields(input: CampaignLandingInput): {key: string; value: string}[] {
  // Handle metaobiektu to systemowy handle upsertu — nie pole (zarezerwowane w Shopify).
  const fields: {key: string; value: string}[] = [
    {key: 'hero_title', value: input.heroTitle},
  ];

  if (input.heroSubtitle?.trim()) {
    fields.push({key: 'hero_subtitle', value: input.heroSubtitle.trim()});
  }
  if (input.productIds?.length) {
    fields.push({
      key: 'product_ids',
      value: JSON.stringify(input.productIds),
    });
  }
  if (input.ctaLabel?.trim()) {
    fields.push({key: 'cta_label', value: input.ctaLabel.trim()});
  }
  if (input.ctaUrl?.trim()) {
    fields.push({key: 'cta_url', value: input.ctaUrl.trim()});
  }

  return fields;
}

export type UpsertCampaignLandingOptions = {
  /**
   * Gdy true — nie rzuca przy brakujących GID; zapisuje tylko istniejące produkty
   * (albo pomija product_ids, gdy żadne nie są ważne).
   */
  skipInvalidProductIds?: boolean;
};

export async function upsertCampaignLanding(
  env: ShopifyEnv,
  input: CampaignLandingInput,
  options: UpsertCampaignLandingOptions = {},
): Promise<string> {
  const handle = input.handle.trim();
  if (!handle) {
    throw new Error('Campaign landing handle is required');
  }
  if (!input.heroTitle.trim()) {
    throw new Error('Campaign landing heroTitle is required');
  }

  let productIds = input.productIds ?? [];
  if (productIds.length > 0) {
    const {valid, missing} = await validateProductGids(env, productIds);
    if (missing.length > 0) {
      if (!options.skipInvalidProductIds) {
        throw new Error(
          `Campaign landing product_ids not found in catalog: ${missing.join(', ')}`,
        );
      }
      console.warn(
        `[campaign-landing] skipInvalidProductIds: dropping ${missing.join(', ')}`,
      );
    }
    productIds = valid;
  }

  const data = await adminGraphql<{
    metaobjectUpsert: {
      metaobject: {id: string; handle: string} | null;
      userErrors: {field: string[]; message: string; code?: string}[];
    };
  }>(env, METAOBJECT_UPSERT_MUTATION, {
    handle: {
      type: CAMPAIGN_LANDING_TYPE,
      handle,
    },
    metaobject: {
      fields: landingFields({...input, handle, productIds}),
    },
  });

  const errors = data.metaobjectUpsert?.userErrors ?? [];
  if (errors.length > 0) {
    throw new Error(
      `metaobjectUpsert failed: ${errors.map((e) => e.message).join('; ')}`,
    );
  }

  const id = data.metaobjectUpsert?.metaobject?.id;
  if (!id) {
    throw new Error('metaobjectUpsert returned no metaobject id');
  }
  return id;
}
