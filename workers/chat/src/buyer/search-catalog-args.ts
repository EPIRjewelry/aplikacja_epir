import {plnWholeToMinor} from '../facts/catalog-ucp-args';

const ALLOWED_KEYS = new Set(['query', 'price_min_pln', 'price_max_pln', 'intent']);

export type ValidatedSearchCatalogArgs =
  | {
      ok: true;
      query: string;
      priceMinMinor?: number;
      priceMaxMinor?: number;
      intent: string;
    }
  | {ok: false; reason: string; droppedKeys?: string[]};

export function validateSearchCatalogArgs(raw: Record<string, unknown>): ValidatedSearchCatalogArgs {
  const dropped: string[] = [];
  for (const key of Object.keys(raw)) {
    if (!ALLOWED_KEYS.has(key)) dropped.push(key);
  }
  if (dropped.length) {
    return {ok: false, reason: 'extra_fields', droppedKeys: dropped};
  }

  const query = typeof raw.query === 'string' ? raw.query.trim() : '';
  if (query.length < 2 || query.length > 120) {
    return {ok: false, reason: 'invalid_query'};
  }

  let intent = typeof raw.intent === 'string' ? raw.intent.trim() : 'purchase';
  if (intent.length > 200) intent = intent.slice(0, 200);

  let priceMinMinor: number | undefined;
  let priceMaxMinor: number | undefined;

  if (raw.price_min_pln !== undefined && raw.price_min_pln !== null) {
    if (typeof raw.price_min_pln !== 'number' || !Number.isInteger(raw.price_min_pln)) {
      return {ok: false, reason: 'invalid_price_min'};
    }
    if (raw.price_min_pln < 1 || raw.price_min_pln > 1_000_000) {
      return {ok: false, reason: 'price_min_out_of_range'};
    }
    priceMinMinor = plnWholeToMinor(raw.price_min_pln);
  }

  if (raw.price_max_pln !== undefined && raw.price_max_pln !== null) {
    if (typeof raw.price_max_pln !== 'number' || !Number.isInteger(raw.price_max_pln)) {
      return {ok: false, reason: 'invalid_price_max'};
    }
    if (raw.price_max_pln < 1 || raw.price_max_pln > 1_000_000) {
      return {ok: false, reason: 'price_max_out_of_range'};
    }
    priceMaxMinor = plnWholeToMinor(raw.price_max_pln);
  }

  if (
    priceMinMinor !== undefined &&
    priceMaxMinor !== undefined &&
    priceMinMinor > priceMaxMinor
  ) {
    return {ok: false, reason: 'price_min_gt_max'};
  }

  return {
    ok: true,
    query,
    priceMinMinor,
    priceMaxMinor,
    intent,
  };
}
