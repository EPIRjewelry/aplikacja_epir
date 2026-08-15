import type {Product} from '@shopify/hydrogen-react/storefront-api-types';

export type CollectionProductNode = Pick<
  Product,
  'id' | 'title' | 'handle' | 'publishedAt' | 'variants'
> & {
  media?: Product['media'];
};

export type CollectionPageInfo = {
  hasNextPage: boolean;
  hasPreviousPage: boolean;
  startCursor: string | null;
  endCursor: string | null;
};

export type CollectionProductsConnection = {
  nodes: CollectionProductNode[];
  pageInfo: CollectionPageInfo;
};

export type CollectionQueryData = {
  collection: {
    id: string;
    title: string;
    description: string | null;
    handle: string;
    products: CollectionProductsConnection;
  } | null;
};
