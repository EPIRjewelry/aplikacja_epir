import {Pagination} from '@shopify/hydrogen';
import type {PageInfo} from '@shopify/hydrogen-react/storefront-api-types';
import type {Product} from '@shopify/hydrogen-react/storefront-api-types';
import ProductCard, {type VariantOptionPreference} from './ProductCard';

export type ProductGridConnection<T extends {id: string} = Product> = {
  nodes: T[];
  pageInfo: PageInfo;
};

export type ProductGridProps<T extends {id: string} = Product> = {
  connection: ProductGridConnection<T>;
  loadMoreLabel?: string;
  preferVariantOptions?: VariantOptionPreference[];
};

export default function ProductGrid<T extends {id: string} = Product>({
  connection,
  loadMoreLabel = 'Załaduj więcej',
  preferVariantOptions,
}: ProductGridProps<T>) {
  return (
    <Pagination connection={connection}>
      {({nodes, NextLink, isLoading, hasNextPage}) => (
        <section className="mx-auto w-full max-w-7xl gap-6 md:gap-8">
          <div className="grid grid-cols-2 gap-4 md:grid-cols-3 md:gap-6 lg:grid-cols-4">
            {nodes.map((product) => (
              <ProductCard
                key={product.id}
                product={product as Product}
                preferVariantOptions={preferVariantOptions}
              />
            ))}
          </div>
          {hasNextPage ? (
            <div className="flex justify-center mt-8">
              <NextLink
                className="inline-block rounded font-medium text-center py-3 px-6 border border-black/20 hover:bg-black/5 transition-colors aria-disabled:opacity-50"
                preventScrollReset
              >
                {isLoading ? 'Ładowanie...' : loadMoreLabel}
              </NextLink>
            </div>
          ) : null}
        </section>
      )}
    </Pagination>
  );
}
