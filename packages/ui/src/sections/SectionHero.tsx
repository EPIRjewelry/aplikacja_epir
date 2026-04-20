import {Link} from '@remix-run/react';
import {MediaFile} from '@shopify/hydrogen-react';
import type {MediaContentType} from '@shopify/hydrogen-react/storefront-api-types';

type PreviewImage = {url?: string};

type MediaImageReference = {
  __typename?: 'MediaImage';
  mediaContentType?: MediaContentType;
  alt?: string;
  previewImage?: PreviewImage;
  image?: {url?: string; altText?: string; width?: number; height?: number};
};

type VideoReference = {
  __typename?: 'Video';
  mediaContentType?: MediaContentType;
  alt?: string;
  previewImage?: PreviewImage;
  sources?: {mimeType?: string; url?: string}[];
};

type GenericFileReference = {
  __typename?: 'GenericFile';
  alt?: string;
  previewImage?: PreviewImage;
  url?: string;
};

type MediaReference = MediaImageReference | VideoReference | GenericFileReference;

export type SectionHeroProps = {
  type?: string;
  id?: string;
  heading?: {value?: string; parsedValue?: string};
  subheading?: {value?: string};
  image?: {
    reference?: MediaReference;
  };
  cta_href?: {value?: string};
  cta_text?: {value?: string};
  cta_target?: {value?: string};
  link?: {
    reference?: {
      href?: {value?: string};
      text?: {value?: string};
      target?: {value?: string};
    };
  };
};

function getValue(
  field: {value?: string} | string | undefined,
): string | undefined {
  if (!field) return undefined;
  if (typeof field === 'string') return field;
  return field.value;
}

function isRenderableMedia(
  mediaRef: MediaReference | undefined,
): mediaRef is MediaImageReference | VideoReference {
  return mediaRef?.__typename === 'MediaImage' || mediaRef?.__typename === 'Video';
}

function getMediaFallbackUrl(mediaRef: MediaReference | undefined): string | undefined {
  if (!mediaRef) return undefined;
  if (mediaRef.__typename === 'MediaImage') {
    return mediaRef.image?.url ?? mediaRef.previewImage?.url;
  }
  if (mediaRef.__typename === 'Video') {
    return mediaRef.previewImage?.url;
  }
  return 'url' in mediaRef ? mediaRef.url ?? mediaRef.previewImage?.url : mediaRef.previewImage?.url;
}

export function SectionHero(props: SectionHeroProps) {
  const section = parseSectionFields(props);
  const {
    image,
    heading,
    subheading,
    cta_href,
    cta_text,
    cta_target,
    link,
  } = section;

  const href = getValue(cta_href) ?? link?.reference?.href?.value;
  const ctaLabel = getValue(cta_text) ?? link?.reference?.text?.value ?? 'Dowiedz się więcej';
  const targetVal = getValue(cta_target) ?? link?.reference?.target?.value;
  const openInNewTab = targetVal === '_blank';

  const mediaRef = image?.reference;
  const hasMedia = isRenderableMedia(mediaRef);
  const imageUrl = getMediaFallbackUrl(mediaRef);
  const fallbackBackgroundImage =
    imageUrl && !hasMedia ? `url("${imageUrl}")` : undefined;

  const showFallbackImage = imageUrl && !hasMedia;

  return (
    <section
      className="relative flex flex-col items-center justify-center min-h-[50vh] bg-cover bg-center px-6 py-20 text-center overflow-hidden"
      style={fallbackBackgroundImage ? {backgroundImage: fallbackBackgroundImage} : undefined}
    >
      {hasMedia && (
        <div className="absolute inset-0 -z-10">
          <MediaFile
            data={mediaRef}
            className="block object-cover w-full h-full"
            mediaOptions={{
              video: {
                controls: false,
                muted: true,
                loop: true,
                playsInline: true,
                autoPlay: true,
                previewImageOptions: {
                  src: mediaRef.previewImage?.url ?? '',
                },
              },
              image: {
                loading: 'eager',
                crop: 'center',
                sizes: '100vw',
                alt: mediaRef.alt ?? '',
              },
            }}
          />
        </div>
      )}
      {showFallbackImage && (
        <img
          src={imageUrl}
          alt={mediaRef?.alt ?? ''}
          className="absolute inset-0 w-full h-full object-cover -z-10"
        />
      )}
      <div className="absolute inset-0 bg-black/30" />
      <div className="relative z-10 max-w-3xl">
        {heading?.parsedValue && (
          <h1 className="text-4xl md:text-5xl font-bold text-white mb-4 drop-shadow-lg">
            {heading.parsedValue}
          </h1>
        )}
        {subheading?.value && (
          <p className="text-xl text-white/95 mb-6 drop-shadow">
            {subheading.value}
          </p>
        )}
        {href && (
          <Link
            to={href}
            className="inline-block px-8 py-3 bg-white text-[rgb(var(--color-primary))] font-semibold rounded hover:opacity-90 transition-opacity"
            {...(openInNewTab && {target: '_blank', rel: 'noopener'})}
          >
            {ctaLabel}
          </Link>
        )}
      </div>
    </section>
  );
}

function parseSectionFields(props: SectionHeroProps) {
  const heading = props.heading;
  const parsedHeading =
    heading && typeof heading === 'object' && 'value' in heading
      ? {
          parsedValue: (heading as {value?: string}).value,
          value: (heading as {value?: string}).value,
        }
      : heading;
  return {
    ...props,
    heading: parsedHeading,
  };
}
