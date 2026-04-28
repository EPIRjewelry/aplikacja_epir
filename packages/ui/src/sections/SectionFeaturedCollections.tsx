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
};

export function SectionFeaturedCollections(props: SectionFeaturedCollectionsProps) {
  const {heading, collections} = props;
  const nodes = (collections?.references?.nodes ?? collections?.nodes ?? [])
    .filter((collection) => Boolean(collection?.handle));

  return (
    <section className="w-full gap-8 py-12">
      {heading?.value && (
        <h2 className="text-3xl font-bold text-[rgb(var(--color-primary))] mb-8 text-center">
          {heading.value}
        </h2>
      )}
      {nodes.length > 0 && (
        <div className="swimlane md:grid md:grid-flow-row md:grid-cols-2 lg:grid-cols-3 md:gap-6 md:overflow-visible md:snap-none md:scroll-px-0 md:px-0">
          {nodes.map((collection, i) => (
            <Link
              to={`/collections/${collection.handle}`}
              key={collection.id ?? i}
              className="flex-shrink-0 w-[85vw] md:w-auto snap-center md:snap-align-none"
            >
              <div className="grid gap-4 group">
                <div className="card-image aspect-[4/5] md:aspect-square bg-gray-100 overflow-hidden">
                  {collection?.image ? (
                    <Image
                      data={collection.image}
                      alt={collection.image.altText ?? collection.title ?? ''}
                      className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
                      sizes="(max-width: 32em) 85vw, 33vw"
                      width={600}
                    />
                  ) : (
                    <div className="w-full h-full flex items-center justify-center text-gray-400">
                      Brak zdjęcia
                    </div>
                  )}
                </div>
                <h3 className="font-semibold text-[rgb(var(--color-primary))] group-hover:opacity-80 transition-opacity">
                  {collection.title}
                </h3>
              </div>
            </Link>
          ))}
        </div>
      )}
    </section>
  );
}
