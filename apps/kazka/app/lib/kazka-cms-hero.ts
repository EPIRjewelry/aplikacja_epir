import type {RouteContentProps} from '@epir/ui';

type HeroSectionNode = {
  type?: string;
  id?: string;
  heading?: {value?: string};
  subheading?: {value?: string};
  image?: {
    reference?: {
      __typename?: string;
      alt?: string;
      previewImage?: {url?: string};
      image?: {url?: string; altText?: string};
      sources?: Array<{mimeType?: string; url?: string}>;
      url?: string;
    };
  };
  cta_href?: {value?: string};
  cta_text?: {value?: string};
  cta_target?: {value?: string};
};

export type CmsHeroSlide = {
  id: string;
  kind: 'image' | 'video';
  src: string;
  alt: string;
  videoSources?: Array<{mimeType?: string; url?: string}>;
  heading?: string;
  subheading?: string;
  ctaHref?: string;
  ctaText?: string;
  ctaTarget?: string;
};

function heroSectionNodes(route: RouteContentProps['route']): HeroSectionNode[] {
  const field = route?.sections;
  const nodes = (field?.references?.nodes ?? field?.nodes ?? []) as HeroSectionNode[];
  return nodes.filter((node) => node.type === 'section_hero');
}

function pickMp4Source(
  sources: Array<{mimeType?: string; url?: string}> | undefined,
): string | undefined {
  if (!sources?.length) return undefined;
  const mp4 = sources.find((s) => s.mimeType?.includes('mp4') && s.url);
  return mp4?.url ?? sources.find((s) => s.url)?.url;
}

function parseHeroSection(node: HeroSectionNode): CmsHeroSlide | null {
  const ref = node.image?.reference;
  if (!ref) return null;

  const heading = node.heading?.value?.trim() || undefined;
  const subheading = node.subheading?.value?.trim() || undefined;
  const ctaHref = node.cta_href?.value?.trim() || undefined;
  const ctaText = node.cta_text?.value?.trim() || undefined;
  const ctaTarget = node.cta_target?.value?.trim() || undefined;

  if (ref.__typename === 'Video') {
    const videoSrc = pickMp4Source(ref.sources);
    const poster = ref.previewImage?.url ?? videoSrc;
    if (!poster && !videoSrc) return null;

    return {
      id: node.id ?? videoSrc ?? poster ?? 'video',
      kind: 'video',
      src: poster ?? videoSrc ?? '',
      alt: ref.alt ?? heading ?? '',
      videoSources: ref.sources,
      heading,
      subheading,
      ctaHref,
      ctaText,
      ctaTarget,
    };
  }

  const imageSrc =
    ref.__typename === 'MediaImage'
      ? ref.image?.url ?? ref.previewImage?.url
      : ref.url ?? ref.previewImage?.url;

  if (!imageSrc) return null;

  const alt =
    (ref.__typename === 'MediaImage' ? ref.image?.altText : undefined) ??
    ref.alt ??
    heading ??
    '';

  return {
    id: node.id ?? imageSrc,
    kind: 'image',
    src: imageSrc,
    alt,
    heading,
    subheading,
    ctaHref,
    ctaText,
    ctaTarget,
  };
}

/** Slajdy hero z pola `sections` metaobiektu route (CMS Shopify). */
export function parseCmsHeroSlides(
  route: RouteContentProps['route'],
): CmsHeroSlide[] {
  return heroSectionNodes(route)
    .map(parseHeroSection)
    .filter((slide): slide is CmsHeroSlide => slide != null);
}
