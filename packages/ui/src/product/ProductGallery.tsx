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

type GalleryMedia = ExternalVideo | MediaImage | Model3d | Video;

type ProductGalleryProps = {
  medias: GalleryMedia[];
  videoPlayback?: 'default' | 'mp4';
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

export function ProductGallery({medias}: ProductGalleryProps) {
  const ordered = orderProductMedia(medias);
  const [selected, setSelected] = useState(0);
  const featuredRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    setSelected(0);
  }, [medias]);

  if (!ordered.length) {
    return null;
  }

  const index = Math.min(selected, ordered.length - 1);
  const featured = ordered[index];
  const isVideo = isProductVideo(featured);

  const extraProps: Record<string, unknown> = {};
  if (featured.mediaContentType === 'MODEL_3D' || featured.__typename === 'Model3d') {
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

  return (
    <div className="grid gap-4">
      <div
        ref={featuredRef}
        className="card-image aspect-square scroll-mt-28 bg-gray-100"
      >
        <MediaFile
          tabIndex={0}
          className="w-full h-full object-cover"
          data={galleryData(featured)}
          {...extraProps}
        />
      </div>
      {ordered.length > 1 ? (
        <div className="grid grid-cols-4 gap-2 md:gap-3 md:grid-cols-5">
          {ordered.map((med, i) => (
            <button
              type="button"
              key={mediaKey(med, i)}
              className={`card-image aspect-square overflow-hidden bg-gray-100 ring-offset-2 ${
                i === index ? 'ring-2 ring-[rgb(var(--color-primary))]' : ''
              }`}
              aria-label={`Pokaż media ${i + 1}`}
              aria-current={i === index ? 'true' : undefined}
              onClick={() => {
                setSelected(i);
                featuredRef.current?.scrollIntoView({
                  behavior: 'smooth',
                  block: 'start',
                });
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
