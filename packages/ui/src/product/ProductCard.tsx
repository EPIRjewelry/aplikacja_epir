import {useRef} from 'react';
import {Link} from '@remix-run/react';
import type {Product} from '@shopify/hydrogen-react/storefront-api-types';
import {hoverMedia, type CardMediaNode} from '../media/hoverMediaUrl';

export type ProductCardProps = {
  product: Product & {media?: {nodes?: CardMediaNode[] | null} | null};
};

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
  const hover = hoverMedia(product.media?.nodes ?? undefined);
  const videoRef = useRef<HTMLVideoElement>(null);

  return (
    <Link
      to={`/products/${product.handle}`}
      className="group"
      onMouseEnter={() => {
        void videoRef.current?.play();
      }}
      onMouseLeave={() => {
        videoRef.current?.pause();
        if (videoRef.current) videoRef.current.currentTime = 0;
      }}
    >
      <div className="grid gap-4 fadeIn">
        <div className="card-image relative aspect-[4/5] overflow-hidden bg-[#f2f2f2]">
          {isDiscounted && (
            <span className="absolute top-2 right-2 z-20 bg-red-600 text-white text-xs font-medium px-2 py-1 rounded">
              Sale
            </span>
          )}
          {imageUrl ? (
            <img
              src={imageUrl}
              alt={imageAlt}
              className={`w-full h-full object-cover ${hover ? 'group-hover:opacity-0' : ''}`}
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
          {hover?.kind === 'video' ? (
            <video
              ref={videoRef}
              className="pointer-events-none absolute inset-0 h-full w-full object-cover opacity-0 group-hover:opacity-100"
              src={hover.url}
              muted
              loop
              playsInline
              preload="metadata"
            />
          ) : hover?.kind === 'image' ? (
            <img
              src={hover.url}
              alt=""
              className="pointer-events-none absolute inset-0 h-full w-full object-cover opacity-0 group-hover:opacity-100"
            />
          ) : null}
        </div>
        <div className="grid gap-1">
          <h3 className="truncate text-sm font-medium text-[rgb(var(--color-primary))] group-hover:opacity-80 transition-opacity">
            {product.title}
          </h3>
          <div className="flex gap-2 items-baseline">
            {priceLabel ? (
              <span className="text-xs text-[rgb(var(--color-primary))]/75">{priceLabel}</span>
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
