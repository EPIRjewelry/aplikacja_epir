import {Link} from '@remix-run/react';
import {
  SectionFeaturedCollections,
  SectionFeaturedProducts,
  type RouteContentProps,
  type SectionField,
  hoverMedia,
} from '@epir/ui';
import {useRef} from 'react';
import {KazkaEditorialHero} from '~/components/KazkaEditorialHero';
import {
  KAZKA_EDITORIAL_CATEGORIES,
  KAZKA_EDITORIAL_COLLECTION_VIDEO,
  KAZKA_EDITORIAL_STRIP_IMAGE,
} from '~/lib/kazka-editorial-assets';

type FeaturedProduct = {
  id: string;
  title: string;
  handle: string;
  priceRange: {
    minVariantPrice: {amount: string; currencyCode: string};
  };
  images: {
    nodes: Array<{
      url: string;
      altText: string | null;
      width: number | null;
      height: number | null;
    }>;
  };
  media?: {
    nodes: Array<{
      mediaContentType?: string | null;
      image?: {url?: string | null} | null;
      sources?: Array<{url?: string | null; mimeType?: string | null}> | null;
    }>;
  };
};

type FeaturedCollection = {
  id: string;
  title: string;
  handle: string;
  image?: {
    altText?: string | null;
    width?: number | null;
    height?: number | null;
    url: string;
  } | null;
};

type SectionNode = {
  id?: string;
  type?: string;
  [key: string]: unknown;
};

function sectionNodes(field: SectionField | undefined): SectionNode[] {
  return (field?.references?.nodes ?? field?.nodes ?? []) as SectionNode[];
}

export function KazkaEditorialHome({
  route,
  collections,
  products,
  hubCollectionHandle,
}: {
  route: RouteContentProps['route'];
  collections: {nodes: FeaturedCollection[]};
  products: {nodes: FeaturedProduct[]};
  hubCollectionHandle: string;
}) {
  const productSections = sectionNodes(route?.featured_products);
  const collectionSections = sectionNodes(route?.featured_collections);
  const collectionNodes = collections.nodes.filter(
    (c) => c.handle !== hubCollectionHandle,
  );

  return (
    <div className="flex w-full flex-col gap-0">
      <KazkaEditorialHero />

      <section className="py-10 md:py-14">
        <h2 className="kazka-editorial-label mb-6 text-center">Odkryj</h2>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-3 sm:gap-4">
          {KAZKA_EDITORIAL_CATEGORIES.map((tile) => (
            <Link
              key={tile.href}
              to={tile.href}
              className="group relative block aspect-[4/5] overflow-hidden bg-[#f2f2f2]"
            >
              <img
                src={tile.image}
                alt={tile.alt}
                className="h-full w-full object-cover transition-transform duration-500 group-hover:scale-[1.02]"
                loading="lazy"
                decoding="async"
              />
              <div className="absolute inset-0 bg-gradient-to-t from-black/45 via-transparent to-transparent" />
              <span className="kazka-editorial-label absolute bottom-4 left-4 text-white">
                {tile.label}
              </span>
            </Link>
          ))}
        </div>
      </section>

      <section className="w-full bg-[#f4efe8] py-8 md:py-12">
        <div className="mb-4 px-4 md:px-6">
          <p className="kazka-editorial-label text-[10px] tracking-[0.28em] text-[rgb(var(--color-primary))]/70">
            KAZKA
          </p>
        </div>
        <div className="w-full overflow-hidden bg-[#f1ece6]">
          <div className="relative aspect-video w-full">
            <iframe
              className="absolute inset-0 h-full w-full"
              src={KAZKA_EDITORIAL_COLLECTION_VIDEO.embedSrc}
              title={KAZKA_EDITORIAL_COLLECTION_VIDEO.title}
              allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
              allowFullScreen
              loading="lazy"
              referrerPolicy="strict-origin-when-cross-origin"
            />
          </div>
        </div>
      </section>

      {productSections.length > 0 ? (
        <div className="py-4 md:py-8">
          {productSections.map((section, i) => (
            <SectionFeaturedProducts
              key={section.id ?? i}
              {...(section as Parameters<typeof SectionFeaturedProducts>[0])}
            />
          ))}
        </div>
      ) : (
        <section className="py-10 md:py-14">
          <h2 className="kazka-editorial-label mb-6 text-center">Wybrane dla Ciebie</h2>
          <div className="grid grid-cols-2 gap-3 md:grid-cols-4 md:gap-5">
            {products.nodes.slice(0, 8).map((product, i) => (
              <EditorialProductTile key={product.id} product={product} index={i} />
            ))}
          </div>
          <div className="mt-8 text-center">
            <Link
              to={`/collections/${hubCollectionHandle}`}
              className="kazka-editorial-cta inline-block"
            >
              Zobacz całą kolekcję
            </Link>
          </div>
        </section>
      )}


      <section className="kazka-editorial-bleed relative aspect-[4/5] w-full overflow-hidden md:aspect-[21/9]">
        <img
          src={KAZKA_EDITORIAL_STRIP_IMAGE.src}
          alt={KAZKA_EDITORIAL_STRIP_IMAGE.alt}
          className="h-full w-full object-cover"
          loading="lazy"
          decoding="async"
        />
        <div className="absolute inset-0 flex items-end bg-gradient-to-t from-black/50 to-transparent p-6 md:p-12">
          <p className="max-w-md text-sm text-white/90 md:text-base">
            Każdy detal powstaje w pracowni we Wrocławiu — od projektu 3D po ręczne wykończenie
            złota i osadzenie kamieni.
          </p>
        </div>
      </section>

      {collectionSections.length > 0 ? (
        <div className="py-8">
          {collectionSections.map((section, i) => (
            <SectionFeaturedCollections
              key={section.id ?? i}
              {...(section as Parameters<typeof SectionFeaturedCollections>[0])}
              excludeHandles={[hubCollectionHandle]}
            />
          ))}
        </div>
      ) : collectionNodes.length > 0 ? (
        <section className="py-10 md:py-14">
          <h2 className="kazka-editorial-label mb-6 text-center">Kolekcje</h2>
          <div className="grid grid-cols-2 gap-3 md:grid-cols-3 md:gap-5">
            {collectionNodes.map((collection) => (
              <Link
                key={collection.id}
                to={`/collections/${collection.handle}`}
                className="group grid gap-3"
              >
                <div className="aspect-[4/5] overflow-hidden bg-[#f2f2f2]">
                  {collection.image?.url ? (
                    <img
                      src={collection.image.url}
                      alt={collection.image.altText || collection.title}
                      className="h-full w-full object-cover transition-transform duration-500 group-hover:scale-[1.02]"
                      width={collection.image.width ?? 600}
                      height={collection.image.height ?? 750}
                      loading="lazy"
                      decoding="async"
                    />
                  ) : null}
                </div>
                <h3 className="text-sm font-medium text-[rgb(var(--color-primary))] group-hover:opacity-70">
                  {collection.title}
                </h3>
              </Link>
            ))}
          </div>
        </section>
      ) : null}
    </div>
  );
}

function EditorialProductTile({
  product,
  index,
}: {
  product: FeaturedProduct;
  index: number;
}) {
  const hover = hoverMedia(product.media?.nodes);
  const videoRef = useRef<HTMLVideoElement>(null);
  const img = product.images.nodes[0];

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
      <div className="relative aspect-[4/5] overflow-hidden bg-[#f2f2f2]">
        {img ? (
          <img
            src={img.url}
            alt={img.altText || product.title}
            className={`h-full w-full object-cover ${hover ? 'group-hover:opacity-0' : ''}`}
            width={img.width ?? 400}
            height={img.height ?? 500}
            loading={index < 4 ? 'eager' : 'lazy'}
            decoding="async"
          />
        ) : null}
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
      <h3 className="truncate text-sm font-medium text-[rgb(var(--color-primary))]">
        {product.title}
      </h3>
      <p className="text-xs text-[rgb(var(--color-primary))]/65">
        {new Intl.NumberFormat('pl-PL', {
          style: 'currency',
          currency: product.priceRange.minVariantPrice.currencyCode,
          maximumFractionDigits: 0,
        }).format(Number(product.priceRange.minVariantPrice.amount))}
      </p>
    </Link>
  );
}

