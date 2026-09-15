import {flattenStoneProfileFields, type StoneProfileField} from './stone-profile';

export type ProductTrustItem = {
  id: string;
  label: string;
  value?: string;
  href?: string;
};

type MetaobjectRef = {
  reference?: {
    fields?: StoneProfileField[] | null;
  } | null;
} | null | undefined;

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

function stoneLabelFromMeta(ref: MetaobjectRef): string | undefined {
  const fields = ref?.reference?.fields;
  if (!fields?.length) return undefined;
  const flat = flattenStoneProfileFields(fields);
  return flat.stone_name ?? flat.nazwa_kamienia ?? undefined;
}

/** Premium trust cues for PDP — clarity and service, not editorial fill. */
export function buildKazkaProductTrustItems(product: {
  stoneProfile?: MetaobjectRef;
  glownyKamien?: MetaobjectRef;
}): ProductTrustItem[] {
  const stone =
    stoneLabelFromMeta(product.stoneProfile) ??
    stoneLabelFromMeta(product.glownyKamien);

  const items: ProductTrustItem[] = [];
  if (stone) {
    items.push({
      id: 'stone',
      label: 'Kamień',
      value: stone,
    });
  }
  return [...items, ...SERVICE_LINK_ITEMS];
}
