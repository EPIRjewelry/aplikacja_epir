import {parseMetafield} from '@shopify/hydrogen';

type MetaobjectField = {
  type?: string;
  key?: string;
  value?: string;
  reference?: unknown;
  references?: {nodes?: unknown[]};
};

/**
 * Recursively parse metaobject fields into a more usable format.
 * Lifts reference/references and parses metafield values.
 */
export function parseSection<Section, ReturnType = Section>(
  section: Section,
): ReturnType {
  const lifted = liftEach(section as Record<string, unknown>, [
    'reference',
    'references',
  ] as const);
  const parsed: Record<string, unknown> = {};

  for (const key in lifted) {
    const node = lifted[key];
    if (typeof node === 'object' && node !== null) {
      const metaField = node as MetaobjectField;
      const isMetafield = metaField?.type && 'value' in metaField;
      const isArray = Array.isArray(node);

      if (isArray) {
        parsed[key] = (node as unknown[]).map((item) =>
          parseSection(item),
        ) as unknown;
      } else if (isMetafield) {
        parsed[key] = parseMetafieldValue(metaField);
      } else if (Object.keys(node as object).length > 0) {
        parsed[key] = parseSection(node as Record<string, unknown>);
      } else {
        parsed[key] = node;
      }
    } else {
      parsed[key] = node;
    }
  }

  return parsed as unknown as ReturnType;
}

function parseMetafieldValue(node: MetaobjectField): unknown {
  switch (node?.type) {
    case 'single_line_text_field':
    case 'multi_line_text_field':
      return parseMetafield(node as Parameters<typeof parseMetafield>[0]);
    case 'list.single_line_text_field':
    case 'list.collection_reference':
    case 'list.product_reference':
      return parseMetafield(node as Parameters<typeof parseMetafield>[0]);
    default:
      return node;
  }
}

function lift<T extends Record<string, unknown>, K extends keyof T>(
  value: T,
  keyToRemove: K,
): T {
  if (!value || typeof value !== 'object') return value;
  const isArray = Array.isArray(value);

  function liftObject(val: Record<string, unknown>) {
    const entries = Object.entries(val)
      .filter(([prop]) => prop !== keyToRemove)
      .map(([prop, val]) => [prop, lift(val as Record<string, unknown>, keyToRemove)]);
    const target = Object.fromEntries(entries);
    const source = keyToRemove in val ? (val as Record<string, unknown>)[keyToRemove as string] : {};
    const lifted = Array.isArray(source)
      ? source
      : Object.assign(target, source);
    return lifted;
  }

  return (isArray
    ? (value as unknown[]).map((item) => liftObject(item as Record<string, unknown>))
    : liftObject(value as Record<string, unknown>)) as T;
}

function liftEach<T extends Record<string, unknown>, K extends readonly (keyof T)[]>(
  obj: T,
  keys: K,
): T {
  return keys.reduce(
    (result, keyToLift) => lift(result as Record<string, unknown>, keyToLift as keyof T) as T,
    obj,
  );
}
