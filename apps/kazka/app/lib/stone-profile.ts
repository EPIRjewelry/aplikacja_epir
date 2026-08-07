/** Klucze pól metaobiektu `stone_profile` mapowane do JSON-LD PropertyValue. */
export const STONE_PROFILE_JSON_LD_FIELDS = [
  {key: 'stone_name', name: 'Stone'},
  {key: 'hardness', name: 'Hardness (Mohs)'},
  {key: 'refractive_index', name: 'Refractive Index'},
  {key: 'jaki_to_zwiazek', name: 'Chemical Composition'},
  {key: 'birthstone_month', name: 'Birthstone'},
  {key: 'chakra', name: 'Chakra'},
  {key: 'paleta_kolorow_kamienia', name: 'Color Range'},
  {key: 'komu_dedykowany_jest_ten_kamien', name: 'For Whom'},
] as const;

export type StoneProfileField = {
  key?: string | null;
  value?: string | null;
};

export type StoneProfilePropertyValue = {
  '@type': 'PropertyValue';
  name: string;
  value: string;
};

/**
 * Spłaszcza `fields` metaobiektu stone_profile do mapy klucz → wartość.
 * Rich text / file_reference z Storefront API przychodzą jako string w `value`
 * (JSON / GID) — do JSON-LD bierzemy tylko klucze z STONE_PROFILE_JSON_LD_FIELDS.
 */
export function flattenStoneProfileFields(
  fields: StoneProfileField[] | null | undefined,
): Record<string, string> {
  if (!Array.isArray(fields) || fields.length === 0) return {};
  const out: Record<string, string> = {};
  for (const field of fields) {
    const key = typeof field?.key === 'string' ? field.key.trim() : '';
    const value = typeof field?.value === 'string' ? field.value.trim() : '';
    if (!key || !value) continue;
    out[key] = value;
  }
  return out;
}

/** Buduje additionalProperty[] dla schema.org Product — tylko niepuste wartości. */
export function stoneProfileToAdditionalProperty(
  fields: StoneProfileField[] | null | undefined,
): StoneProfilePropertyValue[] {
  const stone = flattenStoneProfileFields(fields);
  const props: StoneProfilePropertyValue[] = [];
  for (const {key, name} of STONE_PROFILE_JSON_LD_FIELDS) {
    const value = stone[key];
    if (!value) continue;
    props.push({'@type': 'PropertyValue', name, value});
  }
  return props;
}
