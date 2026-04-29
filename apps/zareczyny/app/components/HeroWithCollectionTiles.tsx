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
            /** Fallback gdy Shopify zwraca wyłącznie preview — patrz SECTION_HERO_FRAGMENT. */
            previewImage?: {url: string} | null;
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

const FEATURED_TILES = [
  {handle: 'zareczyny-zlote', label: 'Pierścionki złote'},
  {handle: 'zareczyny-srebrne', label: 'Pierścionki srebrne'},
] as const;

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
    } else if (mediaRef.__typename === 'MediaImage') {
      const heroImgUrl =
        mediaRef.image?.url || mediaRef.previewImage?.url || '';
      backgroundMediaUrl = heroImgUrl;
    } else if (mediaRef.__typename === 'GenericFile' && mediaRef.url) {
      backgroundMediaUrl = mediaRef.url;
      isVideo = backgroundMediaUrl.endsWith('.mp4');
    }
  }

  const collectionByHandle = new Map(collections.map((c) => [c.handle, c]));

  return (
    <section className="relative flex w-full overflow-hidden bg-[rgb(var(--color-primary))]" style={{height: '100svh'}}>
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
      <div className="absolute inset-0 z-10 bg-black/30 flex flex-col items-center justify-center px-4 pt-8">
        <div className="flex w-full flex-col items-center gap-4">
          <h1 className="-mt-2 text-center text-3xl font-bold tracking-[0.15em] text-white drop-shadow-lg md:-mt-6 md:text-4xl lg:text-5xl">
            Wszystkie Pierścionki Epiru
          </h1>

          <div className="flex w-full max-w-2xl flex-col gap-4 px-8 md:max-w-4xl md:flex-row md:justify-center md:gap-32">
            {FEATURED_TILES.map(({handle, label}) => {
              const collection = collectionByHandle.get(handle);
              return (
                <Link
                  key={handle}
                  to={`/collections/${handle}`}
                  className="group relative aspect-[9/16] w-full flex-1 overflow-hidden rounded-sm bg-white/10 backdrop-blur-md md:w-[220px] md:flex-none"
                >
                  {collection?.image ? (
                    <Image
                      data={collection.image}
                      alt={collection.image.altText ?? label}
                      className="absolute inset-0 h-full w-full object-cover transition-transform duration-500 group-hover:scale-105"
                      sizes="(max-width: 48em) 100vw, 50vw"
                    />
                  ) : (
                    <div
                      aria-hidden
                      className="absolute inset-0 bg-[rgb(var(--color-primary))]/60"
                    />
                  )}
                  <div className="absolute inset-0 bg-black/20 transition-colors duration-300 group-hover:bg-black/10" />
                  <div className="absolute bottom-8 left-0 right-0 px-6 text-center">
                    <h2 className="mb-4 text-2xl font-bold text-white drop-shadow-md">
                      {label}
                    </h2>
                    <span className="inline-block bg-[rgb(var(--color-contrast))] px-8 py-3 text-sm font-semibold tracking-wide text-[rgb(var(--color-primary))] transition-opacity hover:opacity-90">
                      ZOBACZ KOLEKCJĘ
                    </span>
                  </div>
                </Link>
              );
            })}
          </div>

          <p className="text-center font-semibold text-white drop-shadow-md tracking-tight text-[calc(1.25rem+1pt)] md:text-[calc(1.5rem+1pt)]">
            Pierścionki Zaręczynowe
          </p>
        </div>
      </div>
    </section>
  );
}