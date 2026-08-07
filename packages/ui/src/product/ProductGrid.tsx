import {Pagination} from '@shopify/hydrogen';
import type {PageInfo} from '@shopify/hydrogen-react/storefront-api-types';
import type {Product} from '@shopify/hydrogen-react/storefront-api-types';
import ProductCard from './ProductCard';

export type ProductGridConnection<T extends {id: string} = Product> = {
  nodes: T[];
  pageInfo: PageInfo;
};

export type ProductGridProps<T extends {id: string} = Product> = {
  connection: ProductGridConnection<T>;
  loadMoreLabel?: string;
};

export default function ProductGrid<T extends {id: string} = Product>({
  connection,
  loadMoreLabel = 'Załaduj więcej',
}: ProductGridProps<T>) {
  return (
    <Pagination connection={connection}>
      {({nodes, NextLink, isLoading, hasNextPage}) => (
        <section className="w-full gap-6 md:gap-8">
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4 md:gap-6">
            {nodes.map((product) => (
              <ProductCard key={product.id} product={product as Product} />
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
