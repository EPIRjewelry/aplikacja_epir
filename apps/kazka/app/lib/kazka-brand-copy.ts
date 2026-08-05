/**
 * B2C copy marki KAZKA — props-ready pod komponenty @epir/ui brand.
 * Później: mapowanie 1:1 na metaobiekty Shopify (bez zmiany kształtów props).
 */

import type {
  CraftsmanshipStoryProps,
  GemologySectionProps,
  SocialProofBannerProps,
} from '@epir/ui';

export const KAZKA_CRAFTSMANSHIP: CraftsmanshipStoryProps = {
  title: 'Rzemiosło w Polsce',
  bodyHtml:
    '<p>Z dumą prezentujemy kolekcję tworzoną lokalnie w polskiej pracowni jubilerskiej — łączącą projektowanie 3D z precyzyjną, ręczną pracą mistrzów złotnictwa.</p>',
};

export const KAZKA_GEMOLOGY: GemologySectionProps = {
  headline: 'Diamenty wybrane osobiście',
  description:
    'Sercem każdego projektu są diamenty osobiście selekcjonowane przez certyfikowanych gemmologów. Każdy kamień — od klasycznego F/VS2 po diamenty laboratoryjne — ma nienaganny szlif.',
  stats: [
    {label: 'Selekcja', value: 'Każdy kamień'},
    {label: 'Szlif', value: 'Nienaganny'},
    {label: 'Zasięg jakości', value: '16+ krajów'},
  ],
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
  title: 'O marce KAZKA',
  lead: 'Kolekcja diamentowej biżuterii, w której precyzja formy spotyka spokój — od projektu 3D po ręczne wykończenie w polskiej pracowni.',
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
    body: 'Transfer wytwarzania do lokalnej manufaktury jubilerskiej. Od tej chwili każdy projekt powstaje bliżej domu — pod okiem mistrzów złotnictwa.',
  },
  {
    year: 'Dziś',
    title: 'Bezpośrednio dla Ciebie',
    body: 'Ta sama jakość, którą doceniły salony w Europie, jest dostępna w kolekcji KAZKA na kazka.epirbizuteria.pl — bez pośredników, z pełną transparentnością kamienia i rzemiosła.',
  },
];
