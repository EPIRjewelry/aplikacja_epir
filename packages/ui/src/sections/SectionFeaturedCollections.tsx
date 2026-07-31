import {Link} from '@remix-run/react';
import {Image} from '@shopify/hydrogen';

type CollectionNode = {
  id?: string;
  title?: string;
  handle?: string;
  image?: {
    url?: string;
    altText?: string;
    width?: number;
    height?: number;
  };
};

export type SectionFeaturedCollectionsProps = {
  type?: string;
  id?: string;
  heading?: {value?: string; parsedValue?: string};
  collections?: {
    references?: {nodes?: CollectionNode[]};
    nodes?: CollectionNode[];
  };
  /** Handlle kolekcji-hub do pominięcia w kaflach (np. `kazka`). */
  excludeHandles?: readonly string[];
  /** Ukrywa H2 z metaobiektu (np. redundantne „Kolekcja Kazka” na homepage). */
  hideHeading?: boolean;
};

export function SectionFeaturedCollections(props: SectionFeaturedCollectionsProps) {
  const {
    heading,
    collections,
    excludeHandles = [],
    hideHeading = false,
  } = props;

  const excluded = new Set(excludeHandles);
  const nodes = (collections?.references?.nodes ?? collections?.nodes ?? []).filter(
    (collection): collection is CollectionNode & {handle: string} => {
      if (!collection?.handle) return false;
      return !excluded.has(collection.handle);
    },
  );

  const showHeading = !hideHeading && Boolean(heading?.value);

  if (nodes.length === 0 && !showHeading) return null;

  return (
    <section className="w-full py-12 md:py-16">
      {showHeading ? (
        <h2 className="text-3xl font-bold text-[rgb(var(--color-primary))] mb-8 text-center">
          {heading?.value}
        </h2>
      ) : null}
      {nodes.length > 0 ? (
        <div className="grid grid-cols-2 gap-3 md:gap-6 px-2 md:px-0">
          {nodes.map((collection, i) => (
            <Link
              to={`/collections/${collection.handle}`}
              key={collection.id ?? collection.handle}
              className="group fadeIn"
              style={{animationDelay: `${i * 80}ms`}}
            >
              <div className="grid gap-3 md:gap-4">
                <div className="aspect-[4/5] md:aspect-square bg-gray-100 overflow-hidden">
                  {collection.image?.url ? (
                    <Image
                      data={collection.image}
                      alt={collection.image.altText ?? collection.title ?? ''}
                      className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500"
                      sizes="(max-width: 48em) 50vw, 25vw"
                      width={600}
                      height={750}
                    />
                  ) : (
                    <div className="w-full h-full flex items-center justify-center text-gray-400 text-sm">
                      Brak zdjęcia
                    </div>
                  )}
                </div>
                <h3 className="font-semibold text-base md:text-lg text-[rgb(var(--color-primary))] group-hover:opacity-80 transition-opacity text-center md:text-left">
                  {collection.title}
                </h3>
              </div>
            </Link>
          ))}
        </div>
      ) : null}
    </section>
  );
}
