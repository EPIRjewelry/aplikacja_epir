import React from 'react';
import {RichText} from '@shopify/hydrogen';

/** Wynik mapCollectionEnhancedData() — płaski kontrakt z metaobject fields[] */
export type CollectionEnhancedFlat = {
  name: string | null;
  philosophy: string | null;
  accentColor: string | null;
  heroVideoUrl: string | null;
  textureOverlayUrl: string | null;
  lookbookImages: string[];
};

export const COLLECTION_ENHANCED_FRAGMENT = `#graphql
  fragment CollectionEnhanced on Metaobject {
    philosophy: field(key: "philosophy") { value }
    accent_color: field(key: "accent_color") { value }
    hero_video: field(key: "hero_video") {
      reference {
        ... on Video {
          sources { url mimeType format }
        }
      }
    }
    texture_overlay: field(key: "texture_overlay") {
      reference {
        ... on MediaImage {
          image { url altText }
        }
      }
    }
  }
`;

function isShopifyRichTextJsonString(s: string): boolean {
  const t = s.trim();
  if (!t.startsWith('{')) return false;
  try {
    const o = JSON.parse(t) as {type?: string};
    return o?.type === 'root';
  } catch {
    return false;
  }
}

export function CollectionEnhancedHero({
  collectionTitle,
  collectionDescription,
  enhancedData,
}: {
  collectionTitle: string;
  collectionDescription?: string;
  enhancedData?: CollectionEnhancedFlat | null;
}) {
  const displayTitle = enhancedData?.name?.trim() || collectionTitle;
  const philosophy = enhancedData?.philosophy?.trim() ?? null;
  const accentColor = enhancedData?.accentColor?.trim() || '#000000';
  const videoUrl = enhancedData?.heroVideoUrl ?? null;
  const textureUrl = enhancedData?.textureOverlayUrl ?? null;

  const hasEnhancedMeta = Boolean(
    enhancedData &&
      (enhancedData.name ||
        enhancedData.philosophy ||
        enhancedData.accentColor ||
        enhancedData.heroVideoUrl ||
        enhancedData.textureOverlayUrl ||
        enhancedData.lookbookImages.length > 0),
  );

  if (!hasEnhancedMeta) {
    return (
      <header className="grid w-full gap-6 py-6 md:py-8 fadeIn collection-hero collection-hero--default">
        <h1 className="text-3xl md:text-4xl font-bold text-[rgb(var(--color-primary))]">
          {collectionTitle}
        </h1>
        {collectionDescription ? (
          <p className="max-w-2xl text-[rgb(var(--color-primary))]/70 whitespace-pre-wrap">
            {collectionDescription}
          </p>
        ) : null}
      </header>
    );
  }

  return (
    <div className="w-full mb-12 md:mb-16 collection-hero collection-hero--enhanced">
      <div className="mx-auto max-w-3xl px-5 py-8 md:py-10 text-center text-[#2a2a2a]">
        <h1 className="text-3xl md:text-4xl font-semibold mb-6">{displayTitle}</h1>
        {philosophy ? (
          isShopifyRichTextJsonString(philosophy) ? (
            <div className="text-lg leading-relaxed text-left max-w-none">
              <RichText data={philosophy} />
            </div>
          ) : (
            <div className="text-lg leading-relaxed whitespace-pre-wrap">{philosophy}</div>
          )
        ) : null}
      </div>

      <div
        className="relative w-full overflow-hidden aspect-video"
        style={{backgroundColor: accentColor}}
      >
        {videoUrl ? (
          <div className="absolute inset-0 z-[1]">
            <video
              autoPlay
              muted
              loop
              playsInline
              className="h-full w-full object-cover opacity-60"
              src={videoUrl}
            />
          </div>
        ) : null}

        {textureUrl ? (
          <div
            className="absolute inset-0 z-[2] bg-cover bg-center opacity-30 mix-blend-overlay pointer-events-none"
            style={{backgroundImage: `url(${textureUrl})`}}
            role="presentation"
          />
        ) : null}
      </div>

      {enhancedData && enhancedData.lookbookImages.length > 0 ? (
        <ul className="mx-auto mt-10 grid max-w-5xl grid-cols-2 gap-3 px-5 sm:grid-cols-3 md:gap-4">
          {enhancedData.lookbookImages.map((url) => (
            <li key={url} className="overflow-hidden rounded-md">
              <img src={url} alt="" className="h-full w-full object-cover aspect-[3/4]" loading="lazy" />
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}
