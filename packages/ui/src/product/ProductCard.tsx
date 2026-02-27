import {Link} from '@remix-run/react';
import {Image, Money} from '@shopify/hydrogen';
import type {Product} from '@shopify/hydrogen-react/storefront-api-types';

export type ProductCardProps = {
  product: Product;
};

export default function ProductCard({product}: ProductCardProps) {
  const variant = product.variants?.nodes?.[0];
  const {price, compareAtPrice, image} = variant || {};
  const isDiscounted = (compareAtPrice?.amount ?? 0) > (price?.amount ?? 0);

  return (
    <Link to={`/products/${product.handle}`} className="group">
      <div className="grid gap-4 fadeIn">
        <div className="card-image aspect-square bg-gray-100">
          {isDiscounted && (
            <span className="absolute top-2 right-2 z-20 bg-red-600 text-white text-xs font-medium px-2 py-1 rounded">
              Sale
            </span>
          )}
          {image ? (
            <Image
              data={image}
              alt={product.title}
              className="w-full h-full object-cover"
              sizes="(min-width: 1024px) 25vw, (min-width: 768px) 33vw, 50vw"
            />
          ) : (
            <div className="w-full h-full flex items-center justify-center text-gray-400">
              Brak zdjęcia
            </div>
          )}
        </div>
        <div className="grid gap-1">
          <h3 className="font-medium text-[rgb(var(--color-primary))] group-hover:opacity-80 transition-opacity truncate">
            {product.title}
          </h3>
          <div className="flex gap-2 items-baseline">
            <Money withoutTrailingZeros data={price} className="font-semibold" />
            {isDiscounted && compareAtPrice && (
              <Money
                withoutTrailingZeros
                data={compareAtPrice}
                className="text-sm line-through opacity-60"
              />
            )}
          </div>
        </div>
      </div>
    </Link>
  );
}
