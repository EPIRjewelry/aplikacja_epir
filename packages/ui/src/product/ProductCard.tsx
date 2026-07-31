import {Link} from '@remix-run/react';
import type {Product} from '@shopify/hydrogen-react/storefront-api-types';

export type ProductCardProps = {
  product: Product;
};

/** Stałe locale — bez ShopifyProvider / Intl mismatch SSR vs klient (React #418). */
function formatMoneyPl(
  money: {amount: string; currencyCode: string} | null | undefined,
): string | null {
  if (!money?.amount || !money.currencyCode) return null;
  const amount = Number(money.amount);
  if (!Number.isFinite(amount)) return null;
  return new Intl.NumberFormat('pl-PL', {
    style: 'currency',
    currency: money.currencyCode,
    maximumFractionDigits: 0,
  }).format(amount);
}

export default function ProductCard({product}: ProductCardProps) {
  const variant = product.variants?.nodes?.[0];
  const {price, compareAtPrice, image} = variant || {};
  const priceAmount = Number(price?.amount ?? 0);
  const compareAmount = Number(compareAtPrice?.amount ?? 0);
  const isDiscounted = compareAmount > priceAmount;
  const priceLabel = formatMoneyPl(price);
  const compareLabel = isDiscounted ? formatMoneyPl(compareAtPrice) : null;
  const imageUrl = image?.url;
  const imageAlt = image?.altText || product.title;

  return (
    <Link to={`/products/${product.handle}`} className="group">
      <div className="grid gap-4 fadeIn">
        <div className="card-image relative aspect-square bg-gray-100 overflow-hidden">
          {isDiscounted && (
            <span className="absolute top-2 right-2 z-20 bg-red-600 text-white text-xs font-medium px-2 py-1 rounded">
              Sale
            </span>
          )}
          {imageUrl ? (
            <img
              src={imageUrl}
              alt={imageAlt}
              className="w-full h-full object-cover"
              width={image?.width ?? undefined}
              height={image?.height ?? undefined}
              loading="lazy"
              decoding="async"
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
            {priceLabel ? (
              <span className="font-semibold">{priceLabel}</span>
            ) : null}
            {compareLabel ? (
              <span className="text-sm line-through opacity-60">{compareLabel}</span>
            ) : null}
          </div>
        </div>
      </div>
    </Link>
  );
}
