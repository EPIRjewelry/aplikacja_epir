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
    image: '/editorial/lifestyle-rings-hand.png',
    label: 'Pierścionki',
    alt: 'Pierścionki Kazka',
  },
  {
    href: '/collections/kazka-bransoletki',
    image: `${SHOPIFY_CDN}/kazka_jewelry_12.jpg?v=1786728580`,
    label: 'Bransoletki',
    alt: 'Bransoletki Kazka',
  },
  {
    href: '/collections/kazka-naszyjniki',
    image: '/editorial/lifestyle-necklace.png',
    label: 'Naszyjniki',
    alt: 'Naszyjniki Kazka',
  },
  {
    href: '/collections/kazka-kolczyki',
    image: '/editorial/lifestyle-earrings-laugh.png',
    label: 'Kolczyki',
    alt: 'Kolczyki Kazka',
  },
];

export const KAZKA_EDITORIAL_STRIP_IMAGE = {
  src: `${SHOPIFY_CDN}/kazka_jewelry_12.jpg?v=1786728580`,
  alt: 'Złoty soliter — detal w szkle',
};

/** Homepage collection film — https://www.youtube.com/watch?v=6xyQzr1BGg8 */
export const KAZKA_EDITORIAL_COLLECTION_VIDEO = {
  youtubeId: '6xyQzr1BGg8',
  embedSrc:
    'https://www.youtube-nocookie.com/embed/6xyQzr1BGg8?rel=0&modestbranding=1',
  title: 'Kazka — film kolekcji',
};
