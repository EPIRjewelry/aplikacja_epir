import {Link} from '@remix-run/react';
import {useRef} from 'react';
import type {CmsFeaturedProductsSection} from '~/lib/kazka-cms-featured-products';
import {
  KAZKA_PRODUCT_PRICE_CLASS,
  KAZKA_PRODUCT_TITLE_CLASS,
} from '~/lib/kazka-typography';

/**
 * Featured products — CMS (route.featured_products), kafle 4:5, styl Kazka/Orska.
 */
export function KazkaFeaturedProducts({
  id,
  heading,
  body,
  showPrices,
  products,
}: CmsFeaturedProductsSection) {
  if (products.length === 0) return null;

  return (
    <section
      className="w-full bg-[#f1ece6] py-6 md:py-8"
      aria-label={heading ?? 'Wybrane produkty'}
      data-section-id={id}
    >
      {heading ? (
        <h2 className="kazka-section-heading mb-3 px-4 text-center md:px-6">
          {heading}
        </h2>
      ) : null}
      {body ? (
        <p className="kazka-section-lead mx-auto mb-6 max-w-2xl px-4 text-center md:mb-8 md:px-6">
          {body}
        </p>
      ) : heading ? (
        <div className="mb-6 md:mb-8" />
      ) : null}

      <div className="grid w-full grid-cols-2 gap-2 px-0 md:grid-cols-4 md:gap-3">
        {products.map((product, index) => (
          <FeaturedProductTile
            key={product.id}
            product={product}
            index={index}
            showPrices={showPrices}
          />
        ))}
      </div>
    </section>
  );
}

function FeaturedProductTile({
  product,
  index,
  showPrices,
}: {
  product: CmsFeaturedProductsSection['products'][number];
  index: number;
  showPrices: boolean;
}) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const hover = product.hover;

  return (
    <Link
      to={`/products/${product.handle}`}
      className="group grid gap-2"
      onMouseEnter={() => {
        void videoRef.current?.play();
      }}
      onMouseLeave={() => {
        videoRef.current?.pause();
        if (videoRef.current) videoRef.current.currentTime = 0;
      }}
    >
      <div className="kazka-home-tile relative overflow-hidden bg-[#f2f2f2]">
        {product.imageUrl ? (
          <img
            src={product.imageUrl}
            alt={product.imageAlt}
            className={`h-full w-full object-cover ${hover ? 'group-hover:opacity-0' : ''}`}
            loading={index < 2 ? 'eager' : 'lazy'}
            decoding="async"
          />
        ) : (
          <div className="flex h-full w-full items-center justify-center">
            <span className="kazka-editorial-label text-[#2c3238]/40">—</span>
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
            loading="lazy"
            decoding="async"
          />
        ) : null}
      </div>
      <h3 className={KAZKA_PRODUCT_TITLE_CLASS}>
        {product.title}
      </h3>
      {showPrices && product.priceLabel ? (
        <p className={KAZKA_PRODUCT_PRICE_CLASS}>
          {product.priceLabel}
        </p>
      ) : null}
    </Link>
  );
}
