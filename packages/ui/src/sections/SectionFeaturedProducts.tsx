import {Link} from '@remix-run/react';
import {Image, Money} from '@shopify/hydrogen';
import type {
  CurrencyCode,
  Image as ShopifyImage,
} from '@shopify/hydrogen-react/storefront-api-types';
import {hoverMedia, type CardMediaNode} from '../media/hoverMediaUrl';
import {useRef} from 'react';

type ProductVariant = {
  image?: ShopifyImage | null;
};

type ProductNode = {
  id?: string;
  title?: string;
  handle?: string;
  productType?: string;
  variants?: {nodes?: ProductVariant[]};
  media?: {nodes?: CardMediaNode[]};
  priceRange?: {
    minVariantPrice?: {amount?: string; currencyCode?: CurrencyCode} | null;
  };
};

export type SectionFeaturedProductsProps = {
  type?: string;
  id?: string;
  heading?: {value?: string};
  body?: {value?: string};
  products?: {
    references?: {nodes?: ProductNode[]};
    nodes?: ProductNode[];
  };
  withProductPrices?: {value?: string};
  with_product_prices?: {value?: string};
};

export function SectionFeaturedProducts(props: SectionFeaturedProductsProps) {
  const {heading, body, products, withProductPrices, with_product_prices} = props;
  const nodes = products?.references?.nodes ?? products?.nodes ?? [];
  const priceField = withProductPrices ?? with_product_prices;
  const showPrices = priceField?.value === 'true' || priceField?.value === '1';

  return (
    <section className="w-full gap-8 py-12">
      {heading?.value && (
        <h2 className="mb-4 text-center text-xs font-normal uppercase tracking-[0.08em] text-[rgb(var(--color-primary))]/75">
          {heading.value}
        </h2>
      )}
      {body?.value && (
        <p className="text-[rgb(var(--color-primary))]/70 max-w-2xl mx-auto mb-8 text-center">
          {body.value}
        </p>
      )}
      {nodes.length > 0 && (
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4 md:gap-6">
          {nodes.map((product, i) => (
            <FeaturedProductTile
              key={product.id ?? i}
              product={product}
              index={i}
              showPrices={showPrices}
            />
          ))}
        </div>
      )}
    </section>
  );
}

function FeaturedProductTile({
  product,
  index,
  showPrices,
}: {
  product: ProductNode;
  index: number;
  showPrices: boolean;
}) {
  const variant = product.variants?.nodes?.[0];
  const price = product.priceRange?.minVariantPrice;
  const hover = hoverMedia(product.media?.nodes);
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
          {variant?.image ? (
            <Image
              data={variant.image}
              alt={product.title ?? ''}
              className={`h-full w-full object-cover ${hover ? 'group-hover:opacity-0' : ''}`}
              sizes="(min-width: 1024px) 25vw, (min-width: 768px) 33vw, 50vw"
              width={400}
              height={400}
              loading={index < 4 ? 'eager' : 'lazy'}
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
          {showPrices && price ? (
            <Money
              withoutTrailingZeros
              data={price}
              className="text-xs text-[rgb(var(--color-primary))]/75"
            />
          ) : null}
        </div>
      </div>
    </Link>
  );
}

