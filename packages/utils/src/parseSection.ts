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

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function liftValue(value: unknown, keyToRemove: string): unknown {
  if (Array.isArray(value)) {
    return value.map((item) => liftValue(item, keyToRemove));
  }

  if (!isRecord(value)) {
    return value;
  }

  const target = Object.fromEntries(
    Object.entries(value)
      .filter(([prop]) => prop !== keyToRemove)
      .map(([prop, child]) => [prop, liftValue(child, keyToRemove)]),
  );

  const source = value[keyToRemove];
  if (Array.isArray(source)) {
    return source.map((item) => liftValue(item, keyToRemove));
  }

  if (isRecord(source)) {
    return Object.assign(target, source);
  }

  return target;
}

function liftEach<T extends Record<string, unknown>>(
  obj: T,
  keys: readonly string[],
): T {
  return keys.reduce((result, keyToLift) => {
    const lifted = liftValue(result, keyToLift);
    return isRecord(lifted) ? (lifted as T) : result;
  }, obj);
}
