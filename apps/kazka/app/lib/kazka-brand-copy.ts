/**
 * B2C copy marki KAZKA — props-ready pod komponenty @epir/ui brand.
 * Później: mapowanie 1:1 na metaobiekty Shopify (bez zmiany kształtów props).
 */

import type {
  CraftsmanshipStoryProps,
  SocialProofBannerProps,
} from '@epir/ui';
import {
  KAZKA_ABOUT_CRAFTSMANSHIP_IMAGE,
  KAZKA_ABOUT_DIAMOND_HERO_IMAGE,
  KAZKA_ABOUT_DIAMOND_RING_VIDEO,
  KAZKA_ABOUT_PRODUCTION_DETAIL_IMAGE,
  KAZKA_ABOUT_PRODUCTION_TECHNOLOGY_IMAGE,
} from '~/lib/kazka-editorial-assets';
import {KAZKA_JEWELRY_INSTAGRAM_URL} from '~/lib/kazka-header';

export const KAZKA_CRAFTSMANSHIP: CraftsmanshipStoryProps = {
  title: 'Rzemiosło w Polsce',
  bodyHtml:
    '<p>Kolekcja powstaje lokalnie w polskiej pracowni jubilerskiej — od projektu 3D po ręczne wykończenie mistrzów złotnictwa. Każdy model przechodzi wieloetapową kontrolę jakości, żeby forma, szlif i montaż były spójne z tym, co widzisz na zdjęciu.</p>',
  imageUrl: KAZKA_ABOUT_CRAFTSMANSHIP_IMAGE.src,
  imageAlt: KAZKA_ABOUT_CRAFTSMANSHIP_IMAGE.alt,
};

export type AboutProofCard = {
  id: string;
  imageSrc: string;
  imageAlt: string;
  caption: string;
  videoSrc?: string;
};

export const KAZKA_ABOUT_PRODUCTION_CARDS: AboutProofCard[] = [
  {
    id: 'production-technology',
    imageSrc: KAZKA_ABOUT_PRODUCTION_TECHNOLOGY_IMAGE.src,
    imageAlt: KAZKA_ABOUT_PRODUCTION_TECHNOLOGY_IMAGE.alt,
    caption:
      'Zaawansowane technologie wspierają precyzję wzornictwa — biżuteria, w której forma i montaż są równie ważne jak kamień.',
  },
  {
    id: 'production-detail',
    imageSrc: KAZKA_ABOUT_PRODUCTION_DETAIL_IMAGE.src,
    imageAlt: KAZKA_ABOUT_PRODUCTION_DETAIL_IMAGE.alt,
    caption:
      'Precyzyjna produkcja i kunszt rzemiosła — każdy model przechodzi wieloetapową kontrolę jakości przed opuszczeniem pracowni.',
  },
];

export const KAZKA_ABOUT_GEMOLOGY = {
  headline: 'Diamenty wybrane osobiście',
  description:
    'Sercem każdego projektu są diamenty selekcjonowane przez certyfikowanych gemmologów — pod kątem barwy, czystości i masy w karatach. Od klasycznego F/VS2 po diamenty laboratoryjne: każdy kamień ma szlif, który wydobywa światło z formy.',
  stats: [
    {label: 'Selekcja', value: 'Każdy kamień'},
    {label: 'Szlif', value: 'Nienaganny'},
    {label: 'Zasięg jakości', value: '16+ krajów'},
  ],
  heroImageSrc: KAZKA_ABOUT_DIAMOND_HERO_IMAGE.src,
  heroImageAlt: KAZKA_ABOUT_DIAMOND_HERO_IMAGE.alt,
  cards: [
    {
      id: 'diamond-certification',
      imageSrc: KAZKA_ABOUT_DIAMOND_HERO_IMAGE.src,
      imageAlt: 'Diamenty selekcjonowane przez gemmologów Kazka Jewelry',
      caption:
        'Współpracujemy z dostawcami, którzy gwarantują zgodność diamentów z międzynarodowymi certyfikatami jakości.',
    },
    {
      id: 'diamond-quality',
      imageSrc: KAZKA_ABOUT_DIAMOND_RING_VIDEO.src,
      imageAlt: KAZKA_ABOUT_DIAMOND_RING_VIDEO.alt,
      videoSrc: KAZKA_ABOUT_DIAMOND_RING_VIDEO.src,
      caption:
        'Stała jakość kamienia, którą możesz sprawdzić w certyfikacie — i która utrzymuje światło formy przez lata.',
    },
  ] satisfies AboutProofCard[],
};

export const KAZKA_ABOUT_INSTAGRAM = {
  href: KAZKA_JEWELRY_INSTAGRAM_URL,
  label: 'Zobacz pracownię na Instagramie',
};

export const KAZKA_SOCIAL_PROOF: SocialProofBannerProps = {
  text: 'Jakość, której zaufały najbardziej wymagające salony jubilerskie w Europie — teraz dostępna bezpośrednio dla Ciebie.',
};

export type AboutHistoryItem = {
  year: string;
  title: string;
  body: string;
};

export const KAZKA_ABOUT_HERO = {
  eyebrow: 'Geometria Ciszy',
  title: 'O KAZKA JEWELRY',
  lead:
    'Certyfikowana biżuteria diamentowa tworzona w Polsce — precyzja formy, spokój geometrii i rzemiosło, które czujesz na skórze.',
};

export const KAZKA_ABOUT_HISTORY: AboutHistoryItem[] = [
  {
    year: '2014',
    title: 'Początek drogi',
    body: 'Marka KAZKA powstaje z fascynacji czystą formą i światłem diamentu — biżuterią, która mówi mniej, a znaczy więcej.',
  },
  {
    year: '2022',
    title: 'Produkcja w Polsce',
    body:
      'Wytwarzanie przenosimy do lokalnej manufaktury jubilerskiej w Polsce. Ta sama linia, której jakość doceniły salony w ponad 16 krajach Europy — teraz bliżej Ciebie, pod okiem mistrzów złotnictwa.',
  },
  {
    year: 'Dziś',
    title: 'Bezpośrednio dla Ciebie',
    body: 'Ta sama jakość, którą doceniły salony w Europie, jest dostępna w kolekcji KAZKA na kazka.epirbizuteria.pl — bez pośredników, z pełną transparentnością kamienia i rzemiosła.',
  },
];

export const KAZKA_ABOUT_COLLECTION_CTA = {
  href: '/collections/kazka',
  label: 'Zobacz kolekcję',
};
