/** Copy i URL-e górnego paska Kazka — sprzedawca EPIR, linia Kazka Jewelry. */

export const KAZKA_HEADER_BRAND = 'EPIR Art Jewellery';
export const KAZKA_HEADER_DESCRIPTOR = 'Kazka Jewelry';
export const KAZKA_HEADER_TRUST =
  'Projekt i selekcja: EPIR · Złoto 585 / 750';

export const EPIR_GOLD_COLLECTION_URL =
  'https://epirbizuteria.pl/collections/zlota-bizuteria?utm_source=kazka&utm_medium=header&utm_campaign=kazka_to_epir_gold';

/** Hub kolekcji Kazka — strona główna linii. */
export const KAZKA_COLLECTION_HUB_PATH = '/collections/kazka';
export const EPIR_GOLD_HEADER_CTA = 'Złoto EPIR';

/** Kategorie w globalnym headerze — osobne kolekcje Shopify. */
export const KAZKA_CATEGORY_NAV = [
  {
    label: 'Pierścionki',
    handle: 'kazka-pierscionki',
    path: '/collections/kazka-pierscionki',
  },
  {
    label: 'Naszyjniki',
    handle: 'kazka-naszyjniki',
    path: '/collections/kazka-naszyjniki',
  },
  {
    label: 'Kolczyki',
    handle: 'kazka-kolczyki',
    path: '/collections/kazka-kolczyki',
  },
  {
    label: 'Bransoletki',
    handle: 'kazka-bransoletki',
    path: '/collections/kazka-bransoletki',
  },
] as const;
