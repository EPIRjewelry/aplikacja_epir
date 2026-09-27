import {
  KAZKA_HEADER_PHONE,
  KAZKA_HEADER_PHONE_TEL,
  KAZKA_HEADER_WHATSAPP_URL,
} from './kazka-header';

export type ProductTrustContact = {
  prefix: string;
  whatsappLabel: string;
  suffix: string;
  phoneDisplay: string;
  phoneTel: string;
  whatsappHref: string;
};

export type ProductTrustItem = {
  id: string;
  label: string;
  value?: string;
  href?: string;
  contact?: ProductTrustContact;
};

/** Linki do stron sklepu — bez twierdzeń produktowych, których nie da się zweryfikować per SKU. */
const SERVICE_LINK_ITEMS: ProductTrustItem[] = [
  {
    id: 'shipping',
    label: 'Wysyłka',
    href: '/pages/wysylka',
    value: 'Szczegóły wysyłki',
  },
  {
    id: 'returns',
    label: 'Zwroty',
    href: '/pages/polityka-zwrotow',
    value: 'Polityka zwrotów',
  },
  {
    id: 'advisory',
    label: 'Doradztwo',
    contact: {
      prefix: 'Zamówienia przez telefonem/',
      whatsappLabel: 'WhatsApp',
      suffix: ', pytania o szczegóły- ',
      phoneDisplay: KAZKA_HEADER_PHONE,
      phoneTel: `tel:${KAZKA_HEADER_PHONE_TEL}`,
      whatsappHref: KAZKA_HEADER_WHATSAPP_URL,
    },
  },
];

export function kazkaProductStoneLabel(product: {
  mainStone?: {value?: string | null} | null;
}): string | undefined {
  const value = product.mainStone?.value?.trim();
  return value || undefined;
}

/** Premium trust cues for PDP — clarity and service, not editorial fill. */
export function buildKazkaProductTrustItems(_product?: unknown): ProductTrustItem[] {
  return [...SERVICE_LINK_ITEMS];
}
