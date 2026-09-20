/** Copy i URL-e górnego paska Kazka — sprzedawca EPIR, linia Kazka Jewelry. */

export const KAZKA_HEADER_BRAND = 'EPIR Art Jewellery';
export const KAZKA_HEADER_DESCRIPTOR = 'Kazka Jewelry';
export const KAZKA_HEADER_PRESENTS = 'przedstawia: KAZKA Jewelry';
export const KAZKA_HEADER_PHONE = '+48 696 55 33 46';
export const KAZKA_HEADER_PHONE_TEL = '+48696553346';
export const KAZKA_HEADER_EMAIL = 'epir@epirbizuteria.pl';
export const KAZKA_HEADER_WHATSAPP_URL = 'https://wa.me/48696553346';

/** Logo graficzne — ten sam asset co na epirbizuteria.pl. */
export const EPIR_HEADER_LOGO_URL =
  'https://cdn.shopify.com/s/files/1/0249/9756/0425/files/logo-strona.png?v=1711211444';
export const EPIR_HEADER_LOGO_ALT = 'EPIR Art Jewellery';

export const EPIR_GOLD_COLLECTION_URL =
  'https://epirbizuteria.pl/collections/zlota-bizuteria?utm_source=kazka&utm_medium=header&utm_campaign=kazka_to_epir_gold';

/** Hub kolekcji Kazka — strona główna linii. */
export const KAZKA_COLLECTION_HUB_PATH = '/collections/kazka';
export const EPIR_GOLD_HEADER_CTA = 'Złoto EPIR';

export type KazkaNavItem = {
  label: string;
  handle: string;
  path: string;
};

export type KazkaNavGroup = {
  id: string;
  label: string;
  items: readonly KazkaNavItem[];
};

/** Grupy nawigacji w globalnym headerze — dropdowny jak na apex. */
export const KAZKA_HEADER_NAV_GROUPS: readonly KazkaNavGroup[] = [
  {
    id: 'gold',
    label: 'Biżuteria Złota z Brylantami',
    items: [
      {
        label: 'Pierścionki',
        handle: 'kazka-pierscionki',
        path: '/collections/kazka-pierscionki',
      },
      {
        label: 'Kolczyki',
        handle: 'kazka-kolczyki',
        path: '/collections/kazka-kolczyki',
      },
      {
        label: 'Naszyjniki',
        handle: 'kazka-naszyjniki',
        path: '/collections/kazka-naszyjniki',
      },
      {
        label: 'Bransoletki',
        handle: 'kazka-bransoletki',
        path: '/collections/kazka-bransoletki',
      },
    ],
  },
  {
    id: 'gemstone',
    label: 'Biżuteria Złota z Kamieniami Szlachetnymi',
    items: [
      {
        label: 'Biżuteria z szafirami',
        handle: 'kazka-szafiry',
        path: '/collections/kazka-szafiry',
      },
      {
        label: 'Biżuteria ze szmaragdami',
        handle: 'kazka-szmaragdy',
        path: '/collections/kazka-szmaragdy',
      },
      {
        label: 'Biżuteria z rubinami',
        handle: 'kazka-rubiny',
        path: '/collections/kazka-rubiny',
      },
    ],
  },
] as const;
