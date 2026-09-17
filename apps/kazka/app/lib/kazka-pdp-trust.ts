export type ProductTrustItem = {
  id: string;
  label: string;
  value?: string;
  href?: string;
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
    id: 'chat',
    label: 'Doradztwo',
    href: '/chat',
    value: 'Pytania o rozmiar lub konfigurację — czat',
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
