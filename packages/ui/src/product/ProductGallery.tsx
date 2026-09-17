import {useEffect, useRef, useState} from 'react';
import {MediaFile} from '@shopify/hydrogen-react';
import type {
  ExternalVideo,
  MediaImage,
  Model3d,
  Video,
} from '@shopify/hydrogen-react/dist/types/storefront-api-types';
import {preferMp4VideoSources} from '../media/preferMp4VideoSources';
import {isProductVideo, orderProductMedia} from '../media/orderProductMedia';
import {ProductImageZoom} from './ProductImageZoom';
import {ProductGalleryLightbox} from './ProductGalleryLightbox';
import {shopifyImage2048} from './shopifyImage2048';

type GalleryMedia = ExternalVideo | MediaImage | Model3d | Video;

type ProductGalleryProps = {
  medias: GalleryMedia[];
  videoPlayback?: 'default' | 'mp4';
  /** Featured image fit; default cover (Zaręczyny). */
  featuredFit?: 'cover' | 'contain';
  /** CSS object-position for featured image */
  featuredObjectPosition?: string;
  /** Background behind featured when featuredFit is contain */
  featuredBackground?: string;
  /** default = capped square; hero = full column width, taller featured */
  featuredLayout?: 'default' | 'hero';
  /**
   * default = featured + thumbnail picker (Zaręczyny).
   * editorial = hero first image + remaining media in a 2-column stack (Kazka PDP).
   */
  layout?: 'default' | 'editorial';
};

function mediaKey(med: GalleryMedia, i: number): string {
  if ('image' in med && med.image?.id) return med.image.id;
  return med.id ?? `media-${i}`;
}

function galleryData(med: GalleryMedia): GalleryMedia {
  if (isProductVideo(med) && 'sources' in med) {
    return preferMp4VideoSources(med);
  }
  return med;
}

function isMediaImage(med: GalleryMedia): med is MediaImage {
  const type = med.mediaContentType ?? '';
  const name = med.__typename ?? '';
  if (type === 'IMAGE' || name === 'MediaImage') return true;
  return 'image' in med && Boolean(med.image?.url);
}

function scrollFeatured(el: HTMLElement | null) {
  if (!el) return;
  const reduced =
    typeof window !== 'undefined' &&
    window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  el.scrollIntoView({
    behavior: reduced ? 'auto' : 'smooth',
    block: 'start',
  });
}

const FEATURED_CLASS = {
  default: 'card-image aspect-square w-full scroll-mt-28 bg-gray-100 md:max-w-[min(100%,85vh)]',
  hero:
    'card-image aspect-square w-full max-w-none scroll-mt-28 bg-gray-100 md:min-h-[min(85vh,56rem)] lg:aspect-[4/5]',
} as const;

const EDITORIAL_HERO_CLASS =
  'card-image aspect-square w-full max-w-none overflow-hidden scroll-mt-28 bg-gray-100 lg:aspect-[4/5]';

function mediaExtraProps(med: GalleryMedia, isVideo: boolean): Record<string, unknown> {
  const extraProps: Record<string, unknown> = {};
  if (med.mediaContentType === 'MODEL_3D' || med.__typename === 'Model3d') {
    extraProps.interactionPromptThreshold = '0';
    extraProps.ar = false;
    extraProps.loading = 'eager';
    extraProps.disableZoom = true;
  }
  if (isVideo) {
    extraProps.mediaOptions = {
      video: {
        autoPlay: true,
        muted: true,
        loop: true,
        playsInline: true,
        controls: true,
        preload: 'auto',
      },
    };
  }
  return extraProps;
}

type EditorialMediaProps = {
  med: GalleryMedia;
  featuredFit: 'cover' | 'contain';
  featuredObjectPosition: string;
};

function EditorialMedia({
  med,
  featuredFit,
  featuredObjectPosition,
}: EditorialMediaProps) {
  const isVideo = isProductVideo(med);
  const image = isMediaImage(med) ? med.image : null;
  const objectClass = featuredFit === 'contain' ? 'object-contain' : 'object-cover';
  const extraProps = mediaExtraProps(med, isVideo);

  if (image?.url) {
    return (
      <img
        src={shopifyImage2048(image.url)}
        alt={image.altText ?? ''}
        className={`pointer-events-none h-full w-full ${objectClass}`}
        style={{objectPosition: featuredObjectPosition}}
        loading="eager"
        fetchPriority="high"
        draggable={false}
      />
    );
  }

  return (
    <MediaFile
      tabIndex={0}
      className={`h-full w-full ${objectClass}`}
      data={galleryData(med)}
      {...extraProps}
    />
  );
}

function EditorialGallery({
  ordered,
  featuredFit,
  featuredObjectPosition,
  featuredBackground,
}: {
  ordered: GalleryMedia[];
  featuredFit: 'cover' | 'contain';
  featuredObjectPosition: string;
  featuredBackground?: string;
}) {
  const [lightboxIndex, setLightboxIndex] = useState<number | null>(null);
  const [hero, ...rest] = ordered;

  const tileButtonClass =
    'block w-full cursor-pointer border-0 bg-transparent p-0 text-left focus-visible:outline focus-visible:outline-2 focus-visible:outline-[rgb(var(--color-accent))] focus-visible:outline-offset-2';

  return (
    <>
      <div className="product-gallery-editorial grid gap-2 md:gap-3">
        <button
          type="button"
          className={`${tileButtonClass} ${EDITORIAL_HERO_CLASS}`}
          style={featuredBackground ? {backgroundColor: featuredBackground} : undefined}
          aria-label="Otwórz podgląd zdjęcia 1"
          onClick={() => setLightboxIndex(0)}
        >
          <EditorialMedia
            med={hero}
            featuredFit={featuredFit}
            featuredObjectPosition={featuredObjectPosition}
          />
        </button>
        {rest.length > 0 ? (
          <div className="grid grid-cols-2 gap-2 md:gap-3">
            {rest.map((med, i) => (
              <button
                type="button"
                key={mediaKey(med, i + 1)}
                className={`${tileButtonClass} card-image aspect-square overflow-hidden bg-gray-100`}
                style={featuredBackground ? {backgroundColor: featuredBackground} : undefined}
                aria-label={`Otwórz podgląd zdjęcia ${i + 2}`}
                onClick={() => setLightboxIndex(i + 1)}
              >
                <EditorialMedia
                  med={med}
                  featuredFit={featuredFit}
                  featuredObjectPosition={featuredObjectPosition}
                />
              </button>
            ))}
          </div>
        ) : null}
      </div>
      <ProductGalleryLightbox
        medias={ordered}
        openIndex={lightboxIndex}
        onClose={() => setLightboxIndex(null)}
        backgroundColor={featuredBackground}
      />
    </>
  );
}

export function ProductGallery({
  medias,
  featuredFit = 'cover',
  featuredObjectPosition = 'center center',
  featuredBackground,
  featuredLayout = 'default',
  layout = 'default',
}: ProductGalleryProps) {
  const ordered = orderProductMedia(medias);
  const [selected, setSelected] = useState(0);
  const featuredRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    setSelected(0);
  }, [medias]);

  if (!ordered.length) {
    return null;
  }

  if (layout === 'editorial') {
    return (
      <EditorialGallery
        ordered={ordered}
        featuredFit={featuredFit}
        featuredObjectPosition={featuredObjectPosition}
        featuredBackground={featuredBackground}
      />
    );
  }

  const index = Math.min(selected, ordered.length - 1);
  const featured = ordered[index];
  const isVideo = isProductVideo(featured);
  const featuredImage = isMediaImage(featured) ? featured.image : null;
  const featuredObjectClass =
    featuredFit === 'contain' ? 'object-contain' : 'object-cover';
  const extraProps = mediaExtraProps(featured, isVideo);

  return (
    <div className="grid gap-4">
      <div
        ref={featuredRef}
        className={FEATURED_CLASS[featuredLayout]}
        style={featuredBackground ? {backgroundColor: featuredBackground} : undefined}
      >
        {featuredImage?.url ? (
          <ProductImageZoom
            url={featuredImage.url}
            alt={featuredImage.altText}
            objectFit={featuredFit}
            objectPosition={featuredObjectPosition}
            backgroundColor={featuredBackground}
          />
        ) : (
          <MediaFile
            tabIndex={0}
            className={`h-full w-full ${featuredObjectClass}`}
            data={galleryData(featured)}
            {...extraProps}
          />
        )}
      </div>
      {ordered.length > 1 ? (
        <div className="grid grid-cols-4 gap-2 md:grid-cols-5 md:gap-3">
          {ordered.map((med, i) => (
            <button
              type="button"
              key={mediaKey(med, i)}
              className={`card-image aspect-square overflow-hidden bg-gray-100 ring-offset-2 focus-visible:outline focus-visible:outline-2 focus-visible:outline-[rgb(var(--color-accent))] focus-visible:outline-offset-2 ${
                i === index ? 'ring-2 ring-[rgb(var(--color-primary))]' : ''
              }`}
              aria-label={`Pokaż media ${i + 1}`}
              aria-current={i === index ? 'true' : undefined}
              onClick={() => {
                setSelected(i);
                scrollFeatured(featuredRef.current);
              }}
            >
              <MediaFile
                tabIndex={-1}
                className="pointer-events-none h-full w-full object-cover"
                data={galleryData(med)}
                mediaOptions={
                  isProductVideo(med)
                    ? {
                        video: {
                          controls: false,
                          muted: true,
                          playsInline: true,
                          preload: 'metadata',
                        },
                      }
                    : undefined
                }
              />
            </button>
          ))}
        </div>
      ) : null}
    </div>
  );
}
