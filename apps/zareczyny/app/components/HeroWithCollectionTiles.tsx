import {Link} from '@remix-run/react';
import {Image} from '@shopify/hydrogen';

// HeroWithCollectionTiles: nowy layout strony głównej (fullscreen hero + 2 kafle kolekcji).
// Używany tylko w apps/zareczyny/app/routes/_index.tsx. Nie modyfikuje @epir/ui ani apps/kazka.

type HeroDataType = {
  sections?: {
    references?: {
      nodes?: Array<{
        image?: {
          reference?: {
            __typename?: string;
            image?: {url: string; altText?: string | null};
            sources?: Array<{url: string; mimeType: string}>;
            url?: string;
          };
        };
      }>;
    };
  };
};

type CollectionImage = {
  url: string;
  altText?: string | null;
  width?: number | null;
  height?: number | null;
};

type CollectionDataType = {
  id: string;
  title: string;
  handle: string;
  image?: CollectionImage | null;
};

type HeroWithCollectionTilesProps = {
  hero: HeroDataType | null;
  collections: CollectionDataType[];
};

export function HeroWithCollectionTiles({hero, collections}: HeroWithCollectionTilesProps) {
  // Wyciągamy referencję do mediów z pierwszej sekcji hero zwróconej przez loader
  const mediaRef = hero?.sections?.references?.nodes?.[0]?.image?.reference;

  let backgroundMediaUrl = '';
  let isVideo = false;

  if (mediaRef) {
    if (mediaRef.__typename === 'Video' && mediaRef.sources?.length) {
      // Preferuj MP4, jeśli dostępne
      const mp4 = mediaRef.sources.find((s) => s.mimeType === 'video/mp4');
      backgroundMediaUrl = mp4?.url || mediaRef.sources[0].url;
      isVideo = true;
    } else if (mediaRef.__typename === 'MediaImage' && mediaRef.image?.url) {
      backgroundMediaUrl = mediaRef.image.url;
    } else if (mediaRef.__typename === 'GenericFile' && mediaRef.url) {
      backgroundMediaUrl = mediaRef.url;
      isVideo = backgroundMediaUrl.endsWith('.mp4');
    }
  }

  return (
    <section className="relative w-full h-[100vh] overflow-hidden bg-[rgb(var(--color-primary))]">
      {/* Tło: wideo lub fallback obraz/kolor */}
      <div className="absolute inset-0 z-0">
        {isVideo ? (
          <video
            className="w-full h-full object-cover"
            src={backgroundMediaUrl}
            autoPlay
            muted
            loop
            playsInline
          />
        ) : backgroundMediaUrl ? (
          <img
            src={backgroundMediaUrl}
            alt="Hero background"
            className="w-full h-full object-cover"
          />
        ) : (
          <div className="w-full h-full bg-gray-900" />
        )}
      </div>

      {/* Overlay: Nagłówek hero i dwa kafle kolekcji */}
      <div className="absolute inset-0 z-10 bg-black/30 flex flex-col items-center justify-center px-4 pt-16">
        <h1 className="text-4xl md:text-5xl lg:text-6xl font-bold text-white mb-12 text-center drop-shadow-lg">
          Odkryj Nasze Kolekcje
        </h1>

        <div className="flex flex-col md:flex-row gap-6 w-full max-w-5xl">
          {collections.slice(0, 2).map((collection) => (
            <Link
              key={collection.id}
              to={`/collections/${collection.handle}`}
              className="flex-1 relative aspect-[4/5] md:aspect-square group overflow-hidden bg-white/10 backdrop-blur-md rounded-sm"
            >
              {collection.image && (
                <Image
                  data={collection.image}
                  alt={collection.image.altText || collection.title}
                  className="absolute inset-0 w-full h-full object-cover group-hover:scale-105 transition-transform duration-500"
                  sizes="(max-width: 48em) 100vw, 50vw"
                />
              )}
              <div className="absolute inset-0 bg-black/20 group-hover:bg-black/10 transition-colors duration-300" />
              <div className="absolute bottom-8 left-0 right-0 px-6 text-center">
                <h2 className="text-2xl font-bold text-white mb-4 drop-shadow-md">
                  {collection.title}
                </h2>
                <span className="inline-block px-8 py-3 bg-[rgb(var(--color-contrast))] text-[rgb(var(--color-primary))] font-semibold tracking-wide text-sm hover:opacity-90 transition-opacity">
                  ZOBACZ KOLEKCJĘ
                </span>
              </div>
            </Link>
          ))}
        </div>
      </div>
    </section>
  );
}