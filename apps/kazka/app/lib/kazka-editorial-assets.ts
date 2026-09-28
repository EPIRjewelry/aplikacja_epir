/** Editorial imagery — hero slider + category tiles (ORSKA-fill direction). */

const SHOPIFY_CDN =
  'https://cdn.shopify.com/s/files/1/0249/9756/0425/files';

export type EditorialSlide = {
  src: string;
  alt: string;
  /** Hi-res CDN asset — prefer on large screens. */
  hiRes?: boolean;
};

export const KAZKA_HERO_SLIDES: EditorialSlide[] = [
  {
    src: `${SHOPIFY_CDN}/kazka_jewelry_15.jpg?v=1786728584`,
    alt: 'Pierścionki solitery w kamieniu — kolekcja Kazka',
    hiRes: true,
  },
  {
    src: `${SHOPIFY_CDN}/kazka_jewelry_12.jpg?v=1786728580`,
    alt: 'Złoty soliter w szkle — ręcznie robiona biżuteria Kazka',
    hiRes: true,
  },
  {
    src: '/editorial/lifestyle-earrings-laugh.png',
    alt: 'Kolczyki Kazka — modelka',
  },
  {
    src: '/editorial/lifestyle-rings-closeup.png',
    alt: 'Pierścionki z kamieniami — detal',
  },
  {
    src: '/editorial/lifestyle-necklace.png',
    alt: 'Naszyjnik soliter na szyi',
  },
];

export type EditorialCategoryTile = {
  href: string;
  image: string;
  label: string;
  alt: string;
};

export const KAZKA_EDITORIAL_CATEGORIES: EditorialCategoryTile[] = [
  {
    href: '/collections/kazka-pierscionki',
    image: `${SHOPIFY_CDN}/pier-cionki-winieta-powi-kszona-d-o.png?v=1789718901`,
    label: 'Pierścionki',
    alt: 'Pierścionki Kazka',
  },
  {
    href: '/collections/kazka-bransoletki',
    image:
      'https://cdn.shopify.com/s/files/1/0249/9756/0425/files/kafeL_kazka_bransoletka.png?v=1789554672',
    label: 'Bransoletki',
    alt: 'Bransoletki Kazka',
  },
  {
    href: '/collections/kazka-naszyjniki',
    image:
      'https://cdn.shopify.com/s/files/1/0249/9756/0425/files/kafel_kazka_wisior.png?v=1789554672',
    label: 'Naszyjniki',
    alt: 'Naszyjniki Kazka',
  },
  {
    href: '/collections/kazka-kolczyki',
    image:
      'https://cdn.shopify.com/s/files/1/0249/9756/0425/files/kafel_kazka_kolczyki.png?v=1789554672',
    label: 'Kolczyki',
    alt: 'Kolczyki Kazka',
  },
];

export const KAZKA_EDITORIAL_STRIP_IMAGE = {
  src: `${SHOPIFY_CDN}/kazka_jewelry_12.jpg?v=1786728580`,
  alt: 'Złoty soliter — detal w szkle',
};

/** O KAZKA JEWELRY — assety lokalne (źródło: kazkaj.com/about). */
const ABOUT_ASSET_BASE = '/editorial/about';

export const KAZKA_ABOUT_CRAFTSMANSHIP_IMAGE = {
  src: `${ABOUT_ASSET_BASE}/production-workshop.webp`,
  alt: 'Pracownia jubilerska — pierścionek w imadle podczas wykończenia',
};

export const KAZKA_ABOUT_PRODUCTION_TECHNOLOGY_IMAGE = {
  src: `${ABOUT_ASSET_BASE}/production-technology.webp`,
  alt: 'Pracownia jubilerska — precyzyjne wykończenie biżuterii',
};

export const KAZKA_ABOUT_PRODUCTION_DETAIL_IMAGE = {
  src: `${ABOUT_ASSET_BASE}/production-detail.webp`,
  alt: 'Detal biżuterii Kazka — kontrola jakości w pracowni',
};

export const KAZKA_ABOUT_DIAMOND_HERO_IMAGE = {
  src: `${ABOUT_ASSET_BASE}/diamond-selection-hero.webp`,
  alt: 'Luźne diamenty — selekcja gemmologiczna Kazka Jewelry',
};

export const KAZKA_ABOUT_DIAMOND_RING_VIDEO = {
  src: `${ABOUT_ASSET_BASE}/diamond-selection-ring.mp4`,
  alt: 'Pierścionek z brylantem — detal selekcji kamienia',
};

export type EditorialLineTile = {
  href: string;
  image: string;
  label: string;
  body: string;
  alt: string;
};

/** Home — discovery of curated lines (Classic / Big Lab / Fancy Cut / Gemstone). */
export const KAZKA_EDITORIAL_LINES: EditorialLineTile[] = [
  {
    href: '/collections/kazka-classic',
    image: `${SHOPIFY_CDN}/classic.png?v=1789721037`,
    label: 'Classic',
    body: 'Geometryczna czystość soliterów — złoto 9K, 14K i 18K oraz naturalny brylant.',
    alt: 'Linia Classic — Kazka Jewelry',
  },
  {
    href: '/collections/kazka-big-lab',
    image: `${SHOPIFY_CDN}/big-lab.png?v=1789721041`,
    label: 'Big Lab',
    body: 'Ten sam projekt, diament laboratoryjny — świadomy wybór blasku.',
    alt: 'Linia Big Lab — Kazka Jewelry',
  },
  {
    href: '/collections/kazka-fancy-cut',
    image: `${SHOPIFY_CDN}/fancy-cut.png?v=1789721045`,
    label: 'Fancy Cut',
    body: 'Szlify poza okrągłym — kamień jako forma, nie tylko błysk.',
    alt: 'Linia Fancy Cut — Kazka Jewelry',
  },
  {
    href: '/collections/kazka-kamienie-szlachetne',
    image: `${SHOPIFY_CDN}/nowy-ciasny-kadr-editorialowy-z-dekoltem-i-bi-uteri.png?v=1789928822`,
    label: 'Kamienie szlachetne',
    body: 'Szafir, rubin i szmaragd w geometrycznej oprawie złota — kolor bez hałasu.',
    alt: 'Linia Kamienie szlachetne — Kazka Jewelry',
  },
];

/** Homepage collection film — https://www.youtube.com/watch?v=6xyQzr1BGg8 */
export const KAZKA_EDITORIAL_COLLECTION_VIDEO = {
  youtubeId: '6xyQzr1BGg8',
  embedSrc:
    'https://www.youtube-nocookie.com/embed/6xyQzr1BGg8?rel=0&modestbranding=1',
  title: 'Kazka — film kolekcji',
};
