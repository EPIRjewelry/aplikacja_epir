import ProductCard from './ProductCard';
import type {Product} from '@shopify/hydrogen-react/storefront-api-types';
import {useEffect, useState} from 'react';
import {useFetcher} from '@remix-run/react';

export type ProductGridProps = {
  url: string;
  products: Product[];
  hasNextPage: boolean;
  endCursor: string;
};

type ProductGridFetcherData = {
  collection: {
    products: {
      nodes: Product[];
      pageInfo: {
        hasNextPage: boolean;
        endCursor: string;
      };
    };
  };
};

export default function ProductGrid({
  products: initProducts,
  url,
  hasNextPage,
  endCursor: initEndCursor,
}: ProductGridProps) {
  const [nextPage, setNextPage] = useState(hasNextPage);
  const [endCursor, setEndCursor] = useState(initEndCursor);
  const [products, setProducts] = useState(initProducts || []);

  const fetcher = useFetcher<ProductGridFetcherData>();

  function fetchMoreProducts() {
    fetcher.load(`${url}?index&cursor=${endCursor}`);
  }

  useEffect(() => {
    if (!fetcher.data) return;
    const {collection} = fetcher.data;
    setProducts((prev) => [...prev, ...collection.products.nodes]);
    setNextPage(collection.products.pageInfo.hasNextPage);
    setEndCursor(collection.products.pageInfo.endCursor);
  }, [fetcher.data]);

  return (
    <section className="w-full gap-6 md:gap-8">
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4 md:gap-6">
        {products.map((product) => (
          <ProductCard key={product.id} product={product} />
        ))}
      </div>
      {nextPage && (
        <div className="flex justify-center mt-8">
          <button
            className="inline-block rounded font-medium text-center py-3 px-6 border border-black/20 hover:bg-black/5 transition-colors disabled:opacity-50"
            disabled={fetcher.state !== 'idle'}
            onClick={fetchMoreProducts}
          >
            {fetcher.state !== 'idle' ? 'Ładowanie...' : 'Załaduj więcej'}
          </button>
        </div>
      )}
    </section>
  );
}
