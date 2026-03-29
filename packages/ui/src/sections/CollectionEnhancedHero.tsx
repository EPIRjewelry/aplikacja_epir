import React from 'react';

// Kontrakt GraphQL dla rozszerzonych danych kolekcji z Headless CMS
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

type EnhancedData = {
  philosophy?: { value: string };
  accent_color?: { value: string };
  hero_video?: { reference: any };
  texture_overlay?: { reference: any };
};

export function CollectionEnhancedHero({
  collectionTitle,
  collectionDescription,
  enhancedData,
}: {
  collectionTitle: string;
  collectionDescription?: string;
  enhancedData?: EnhancedData;
}) {
  // Programowanie defensywne (Optional Chaining) chroni przed błędem krytycznym aplikacji
  const philosophy = enhancedData?.philosophy?.value;
  const accentColor = enhancedData?.accent_color?.value || 'rgb(var(--color-primary))';

  const videoUrl = enhancedData?.hero_video?.reference?.sources?.find(
    (source: any) => source.mimeType === 'video/mp4',
  )?.url;

  const textureUrl = enhancedData?.texture_overlay?.reference?.image?.url;

  return (
    <header
      className="grid w-full gap-6 py-6 md:py-8 fadeIn relative z-10"
      style={{ '--accent': accentColor } as React.CSSProperties}
    >
      {/* Wideo renderowane dynamicznie w tle (najniższy z-index) */}
      {videoUrl && (
        <video
          autoPlay
          muted
          loop
          playsInline
          className="absolute inset-0 w-full h-full object-cover -z-20"
          src={videoUrl}
        />
      )}

      {/* Tekstura nakładana na wideo z odpowiednim trybem mieszania */}
      {textureUrl && (
        <div
          className="absolute inset-0 w-full h-full opacity-50 pointer-events-none -z-10 mix-blend-overlay"
          style={{ backgroundImage: `url(${textureUrl})`, backgroundSize: 'cover' }}
        />
      )}

      {/* Tytuł wykorzystujący wstrzykniętą zmienną CSS dla koloru akcentu z panelu Shopify */}
      <h1 className="text-3xl md:text-4xl font-bold" style={{ color: 'var(--accent)' }}>
        {collectionTitle}
      </h1>

      <p className="max-w-2xl text-[rgb(var(--color-primary))]/70 whitespace-pre-wrap">
        {philosophy || collectionDescription}
      </p>
    </header>
  );
}
