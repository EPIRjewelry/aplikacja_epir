import {MediaFile} from '@shopify/hydrogen-react';
import type {
  ExternalVideo,
  MediaImage,
  Model3d,
  Video,
} from '@shopify/hydrogen-react/dist/types/storefront-api-types';

type ProductGalleryProps = {
  medias: (ExternalVideo | MediaImage | Model3d | Video)[];
};

export function ProductGallery({medias}: ProductGalleryProps) {
  if (!medias.length) {
    return null;
  }

  return (
    <div className="grid gap-4 grid-cols-1 md:grid-cols-2 overflow-x-auto">
      {medias.map(
        (med: ExternalVideo | MediaImage | Model3d | Video, i: number) => {
          const extraProps: Record<string, unknown> = {};
          if (med.mediaContentType === 'MODEL_3D') {
            extraProps.interactionPromptThreshold = '0';
            extraProps.ar = false;
            extraProps.loading = 'eager';
            extraProps.disableZoom = true;
          }

          return (
            <div
              className={`card-image aspect-square bg-gray-100 ${
                i === 0 ? 'md:col-span-2' : ''
              }`}
              key={'image' in med ? med.image?.id : med.id}
            >
              <MediaFile
                tabIndex={0}
                className="w-full h-full object-cover"
                data={med}
                {...extraProps}
              />
            </div>
          );
        },
      )}
    </div>
  );
}
