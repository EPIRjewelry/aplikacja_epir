import {useRef} from 'react';
import {Link} from '@remix-run/react';
import type {Product} from '@shopify/hydrogen-react/storefront-api-types';
import {hoverMedia, type CardMediaNode} from '../media/hoverMediaUrl';

export type VariantOptionPreference = {name: string; value: string};

export type ProductCardProps = {
  product: Product & {media?: {nodes?: CardMediaNode[] | null} | null};
  preferVariantOptions?: VariantOptionPreference[];
  titleClassName?: string;
  priceClassName?: string;
};

const DEFAULT_TITLE_CLASS =
  'truncate text-sm font-medium text-[rgb(var(--color-primary))] group-hover:opacity-80 transition-opacity';

const DEFAULT_PRICE_CLASS = 'text-xs text-[rgb(var(--color-primary))]/75';

function pickPreferredVariant<
  V extends {selectedOptions?: {name: string; value: string}[] | null},
>(variants: V[] | null | undefined, prefer?: VariantOptionPreference[]): V | undefined {
  if (!variants?.length) return undefined;
  if (!prefer?.length) return variants[0];

  const matched = variants.find((variant) =>
    prefer.every((opt) =>
      variant.selectedOptions?.some(
        (selected) => selected.name === opt.name && selected.value === opt.value,
      ),
    ),
  );

  return matched ?? variants[0];
}

function buildProductHref(
  handle: string,
  prefer?: VariantOptionPreference[],
): string {
  if (!prefer?.length) return `/products/${handle}`;
  const params = new URLSearchParams();
  for (const {name, value} of prefer) {
    params.set(name, value);
  }
  return `/products/${handle}?${params.toString()}`;
}

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

export default function ProductCard({
  product,
  preferVariantOptions,
  titleClassName = DEFAULT_TITLE_CLASS,
  priceClassName = DEFAULT_PRICE_CLASS,
}: ProductCardProps) {
  const variant = pickPreferredVariant(
    product.variants?.nodes,
    preferVariantOptions,
  );
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
      to={buildProductHref(product.handle, preferVariantOptions)}
      className="group"
      onMouseEnter={() => {
        void videoRef.current?.play();
      }}
      onMouseLeave={() => {
        videoRef.current?.pause();
        if (videoRef.current) videoRef.current.currentTime = 0;
      }}
    >
      <div className="grid gap-2 fadeIn md:gap-3">
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
          <h3 className={titleClassName}>
            {product.title}
          </h3>
          <div className="flex gap-2 items-baseline">
            {priceLabel ? (
              <span className={priceClassName}>{priceLabel}</span>
            ) : null}
            {compareLabel ? (
              <span className="text-sm tabular-nums line-through opacity-60">{compareLabel}</span>
            ) : null}
          </div>
        </div>
      </div>
    </Link>
  );
}
