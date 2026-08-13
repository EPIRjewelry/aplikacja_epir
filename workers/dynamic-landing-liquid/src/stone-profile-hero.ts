/**
 * Resolve Hero / makro image for a product.
 * Note: metafield custom.stone_profile is gemmology metaobject — not a file.
 * Macro shots come from product media (alt/filename) or optional CDN override map.
 */

export type ProductMediaImage = {
  url?: string;
  altText?: string | null;
  width?: number | null;
  height?: number | null;
};

export type HeroProductLike = {
  handle?: string;
  title?: string;
  featuredImage?: ProductMediaImage | null;
  media?: Array<{image?: ProductMediaImage | null} | null> | null;
};

export type ResolvedHeroImage = {
  url: string;
  alt: string;
  width?: number;
  height?: number;
  source: 'override' | 'stone_media' | 'featured';
};

/** Optional handle → CDN URL overrides (fill later from export / Admin). */
export const STONE_PROFILE_CDN_BY_HANDLE: Record<string, string> = {};

const STONE_MEDIA_RE = /stone_profile|profil.?kamienia|makro/i;

function pickFromMedia(
  media: HeroProductLike['media'],
): ProductMediaImage | null {
  if (!Array.isArray(media)) return null;
  for (const node of media) {
    const img = node?.image;
    if (!img?.url) continue;
    const alt = img.altText || '';
    const path = img.url || '';
    if (STONE_MEDIA_RE.test(alt) || STONE_MEDIA_RE.test(path)) {
      return img;
    }
  }
  return null;
}

export function resolveHeroImage(
  product: HeroProductLike | null | undefined,
  overrides: Record<string, string> = STONE_PROFILE_CDN_BY_HANDLE,
): ResolvedHeroImage | null {
  if (!product) return null;
  const handle = (product.handle || '').trim();
  const overrideUrl = handle && overrides[handle] ? overrides[handle].trim() : '';

  if (overrideUrl) {
    return {
      url: overrideUrl,
      alt: product.title || handle || 'Produkt',
      width: 2048,
      height: 2048,
      source: 'override',
    };
  }

  const stone = pickFromMedia(product.media);
  if (stone?.url) {
    return {
      url: stone.url,
      alt: stone.altText || product.title || handle || 'Profil kamienia',
      width: stone.width ?? 2048,
      height: stone.height ?? 2048,
      source: 'stone_media',
    };
  }

  const featured = product.featuredImage;
  if (featured?.url) {
    return {
      url: featured.url,
      alt: featured.altText || product.title || handle || 'Produkt',
      width: featured.width ?? 2048,
      height: featured.height ?? 2048,
      source: 'featured',
    };
  }

  return null;
}

/** Adapt Storefront ProductNode shape (media.nodes) to resolveHeroImage input. */
export function productNodeToHeroInput(product: {
  handle?: string;
  title?: string;
  featuredImage?: ProductMediaImage | null;
  media?: {nodes?: Array<{image?: ProductMediaImage | null} | null>} | null;
}): HeroProductLike {
  return {
    handle: product.handle,
    title: product.title,
    featuredImage: product.featuredImage,
    media: product.media?.nodes ?? null,
  };
}
