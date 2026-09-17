import {Dialog, Transition} from '@headlessui/react';
import {Fragment, useEffect, useState} from 'react';
import {MediaFile} from '@shopify/hydrogen-react';
import type {
  ExternalVideo,
  MediaImage,
  Model3d,
  Video,
} from '@shopify/hydrogen-react/dist/types/storefront-api-types';
import {preferMp4VideoSources} from '../media/preferMp4VideoSources';
import {isProductVideo} from '../media/orderProductMedia';
import {shopifyImage2048} from './shopifyImage2048';

type GalleryMedia = ExternalVideo | MediaImage | Model3d | Video;

type ProductGalleryLightboxProps = {
  medias: GalleryMedia[];
  openIndex: number | null;
  onClose: () => void;
  backgroundColor?: string;
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

function shopifyImageWidth(url: string, width: number): string {
  if (!url) return url;
  try {
    const u = new URL(url);
    u.searchParams.set('width', String(width));
    return u.toString();
  } catch {
    const sep = url.includes('?') ? '&' : '?';
    return `${url}${sep}width=${width}`;
  }
}

function LightboxMainMedia({
  med,
  backgroundColor,
}: {
  med: GalleryMedia;
  backgroundColor?: string;
}) {
  const image = isMediaImage(med) ? med.image : null;
  const isVideo = isProductVideo(med);

  if (image?.url) {
    return (
      <img
        src={shopifyImage2048(image.url)}
        alt={image.altText ?? ''}
        className="max-h-[min(85vh,56rem)] max-w-full object-contain"
        draggable={false}
      />
    );
  }

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

  return (
    <div
      className="flex h-[min(85vh,56rem)] w-full max-w-3xl items-center justify-center"
      style={backgroundColor ? {backgroundColor} : undefined}
    >
      <MediaFile
        tabIndex={0}
        className="max-h-full max-w-full object-contain"
        data={galleryData(med)}
        {...extraProps}
      />
    </div>
  );
}

function LightboxThumbnail({
  med,
  index,
  active,
  onSelect,
}: {
  med: GalleryMedia;
  index: number;
  active: boolean;
  onSelect: (index: number) => void;
}) {
  const image = isMediaImage(med) ? med.image : null;

  return (
    <button
      type="button"
      className={`aspect-square w-16 shrink-0 overflow-hidden border bg-neutral-100 transition md:w-20 ${
        active
          ? 'border-[rgb(var(--color-primary))] ring-1 ring-[rgb(var(--color-primary))]'
          : 'border-neutral-300 hover:border-neutral-500'
      }`}
      aria-label={`Pokaż zdjęcie ${index + 1}`}
      aria-current={active ? 'true' : undefined}
      onClick={() => onSelect(index)}
    >
      {image?.url ? (
        <img
          src={shopifyImageWidth(image.url, 160)}
          alt=""
          className="h-full w-full object-cover"
          draggable={false}
        />
      ) : (
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
      )}
    </button>
  );
}

export function ProductGalleryLightbox({
  medias,
  openIndex,
  onClose,
  backgroundColor = '#f5f0e6',
}: ProductGalleryLightboxProps) {
  const [index, setIndex] = useState(openIndex ?? 0);
  const isOpen = openIndex !== null;
  const safeIndex = Math.min(Math.max(index, 0), Math.max(medias.length - 1, 0));
  const current = medias[safeIndex];

  useEffect(() => {
    if (openIndex !== null) {
      setIndex(openIndex);
    }
  }, [openIndex]);

  if (!medias.length) {
    return null;
  }

  return (
    <Transition appear show={isOpen} as={Fragment}>
      <Dialog as="div" className="relative z-[100]" onClose={onClose}>
        <Transition.Child
          as={Fragment}
          enter="ease-out duration-200"
          enterFrom="opacity-0"
          enterTo="opacity-100"
          leave="ease-in duration-150"
          leaveFrom="opacity-100"
          leaveTo="opacity-0"
        >
          <div className="fixed inset-0 bg-neutral-100" aria-hidden="true" />
        </Transition.Child>

        <div className="fixed inset-0 overflow-hidden">
          <Dialog.Panel
            className="product-gallery-lightbox flex h-full w-full flex-col"
            style={{backgroundColor}}
          >
            <header className="flex shrink-0 items-center justify-end px-4 py-3 md:px-6">
              <button
                type="button"
                className="p-2 text-[rgb(var(--color-primary))] transition hover:opacity-60"
                aria-label="Zamknij podgląd"
                onClick={onClose}
              >
                <svg
                  xmlns="http://www.w3.org/2000/svg"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="1.5"
                  className="h-6 w-6"
                  aria-hidden="true"
                >
                  <path strokeLinecap="round" d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </header>

            <div className="flex min-h-0 flex-1 flex-col md:flex-row">
              {medias.length > 1 ? (
                <aside className="hidden shrink-0 flex-col gap-2 overflow-y-auto border-r border-neutral-300/60 px-4 py-2 md:flex md:w-28 md:px-3 lg:w-32">
                  {medias.map((med, i) => (
                    <LightboxThumbnail
                      key={mediaKey(med, i)}
                      med={med}
                      index={i}
                      active={i === safeIndex}
                      onSelect={setIndex}
                    />
                  ))}
                </aside>
              ) : null}

              <main className="flex min-h-0 flex-1 items-center justify-center px-4 pb-4 md:px-8 md:pb-8">
                {current ? (
                  <LightboxMainMedia med={current} backgroundColor={backgroundColor} />
                ) : null}
              </main>
            </div>

            {medias.length > 1 ? (
              <div className="flex shrink-0 gap-2 overflow-x-auto border-t border-neutral-300/60 px-4 py-3 md:hidden">
                {medias.map((med, i) => (
                  <LightboxThumbnail
                    key={mediaKey(med, i)}
                    med={med}
                    index={i}
                    active={i === safeIndex}
                    onSelect={setIndex}
                  />
                ))}
              </div>
            ) : null}
          </Dialog.Panel>
        </div>
      </Dialog>
    </Transition>
  );
}
