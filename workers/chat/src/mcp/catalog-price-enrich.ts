/**
 * Po compact: jawne price_minor + currency + price_display_pl (PLN), bez surowego `amount`
 * (żeby model nie „przeliczał” ×10/×100).
 */

import { normalizeShopifyAmountToMajorUnits } from './money-normalize';

export function formatPlnMajorForDisplay(major: number): string {
  if (!Number.isFinite(major) || major <= 0) return '';
  const integerLike = Math.abs(major - Math.round(major)) < 1e-9;
  const s = new Intl.NumberFormat('pl-PL', {
    maximumFractionDigits: integerLike ? 0 : 2,
    minimumFractionDigits: integerLike ? 0 : 2,
  }).format(major);
  return `${s.replace(/\u00a0/g, ' ')} zł`;
}

function isMoneyLikeObject(o: Record<string, unknown>): boolean {
  const cc = o.currencyCode ?? o.currency;
  const amt = o.amount;
  return typeof cc === 'string' && cc.trim().length >= 3 && (typeof amt === 'string' || typeof amt === 'number');
}

export function enrichMoneyLikeNode(o: Record<string, unknown>): Record<string, unknown> {
  if (!isMoneyLikeObject(o)) return { ...o };
  const ccRaw = (o.currencyCode ?? o.currency) as string;
  const cc = ccRaw.trim().toUpperCase();
  const major = normalizeShopifyAmountToMajorUnits(o.amount, cc);
  if (major === null || major <= 0) return { ...o };

  const minor = Math.round(major * 100);
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(o)) {
    if (k === 'amount') continue;
    out[k] = v;
  }
  out.currencyCode = cc;
  out.currency = cc;
  out.price_minor = minor;
  if (cc === 'PLN') {
    out.price_display_pl = formatPlnMajorForDisplay(major);
  }
  return out;
}

export function enrichCatalogMoneyFieldsDeep(value: unknown, depth: number): unknown {
  if (depth <= 0 || value === null || value === undefined) return value;
  if (Array.isArray(value)) {
    return value.map((item) => enrichCatalogMoneyFieldsDeep(item, depth - 1));
  }
  if (typeof value !== 'object') return value;
  const o = value as Record<string, unknown>;
  if (isMoneyLikeObject(o)) {
    return enrichMoneyLikeNode(o);
  }
  const output: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(o)) {
    output[k] = enrichCatalogMoneyFieldsDeep(v, depth - 1);
  }
  return output;
}
