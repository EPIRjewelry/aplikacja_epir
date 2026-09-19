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

export type EditorialLineTile = {
  href: string;
  image: string;
  label: string;
  body: string;
  alt: string;
};

/** Home — discovery of curated lines (Classic / Big Lab / Fancy Cut). */
export const KAZKA_EDITORIAL_LINES: EditorialLineTile[] = [
  {
    href: '/collections/kazka-classic',
    image: `${SHOPIFY_CDN}/classic.png?v=1789721037`,
    label: 'Classic',
    body: 'Geometryczna czystość soliterów — złoto 18K i naturalny brylant.',
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
];

/** Homepage collection film — https://www.youtube.com/watch?v=6xyQzr1BGg8 */
export const KAZKA_EDITORIAL_COLLECTION_VIDEO = {
  youtubeId: '6xyQzr1BGg8',
  embedSrc:
    'https://www.youtube-nocookie.com/embed/6xyQzr1BGg8?rel=0&modestbranding=1',
  title: 'Kazka — film kolekcji',
};
