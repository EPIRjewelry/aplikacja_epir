/**
 * Ochrona przed halucynacjami cenowymi: porównanie kwot w odpowiedzi asystenta
 * z cenami zwróconymi przez search_catalog (Shopify MCP / Storefront).
 */

/** Maks. dopuszczalny względny rozjazd (np. 0.28 = 28%). */
export const PRICING_MISMATCH_MAX_RATIO = 0.28;

export const PRICING_SAFE_FALLBACK_MESSAGE_PL =
  'Nie mogę podać pewnej ceny poza danymi z naszego katalogu — proszę sprawdzić aktualną kwotę na karcie produktu.';

export type ProductPriceRef = {
  amountPln: number;
  handle: string | null;
  urlHints: string[];
};

import { majorUnitsFromMoneyLike, normalizeShopifyAmountToMajorUnits } from './mcp/money-normalize';

function unwrapMcpLikePayload(root: unknown): unknown {
  if (!root || typeof root !== 'object') return root;
  const o = root as Record<string, unknown>;
  const content = o.content;
  if (Array.isArray(content) && content.length > 0) {
    const first = content[0];
    if (first && typeof first === 'object') {
      const t = (first as Record<string, unknown>).text;
      if (typeof t === 'string') {
        try {
          return JSON.parse(t);
        } catch {
          return root;
        }
      }
    }
  }
  return root;
}

function parseAmountLike(value: unknown): number | null {
  if (typeof value === 'number' && Number.isFinite(value) && value > 0) return value;
  if (typeof value === 'string') {
    const n = parseFloat(value.replace(/\s/g, '').replace(',', '.'));
    if (Number.isFinite(n) && n > 0) return n;
  }
  return null;
}

/** Rekurencyjnie zbiera ref-y cenowe powiązane z handle / URL produktu. */
export function extractProductPriceRefsFromCatalogSnapshot(snapshot: unknown): ProductPriceRef[] {
  const unwrapped = unwrapMcpLikePayload(snapshot);
  const out: ProductPriceRef[] = [];
  const seen = new Set<string>();

  const pushRef = (amount: number, handle: string | null, urlHints: string[]) => {
    const key = `${amount}:${handle ?? ''}:${urlHints.join('|')}`;
    if (seen.has(key)) return;
    seen.add(key);
    out.push({ amountPln: amount, handle, urlHints });
  };

  const visit = (node: unknown, depth: number) => {
    if (depth <= 0 || node === null || node === undefined) return;
    if (Array.isArray(node)) {
      node.forEach((x) => visit(x, depth - 1));
      return;
    }
    if (typeof node !== 'object') return;
    const o = node as Record<string, unknown>;

    const handle = typeof o.handle === 'string' ? o.handle.trim() : null;
    const urlRaw =
      typeof o.onlineStoreUrl === 'string'
        ? o.onlineStoreUrl
        : typeof o.url === 'string'
          ? o.url
          : typeof o.productUrl === 'string'
            ? o.productUrl
            : null;

    let amount: number | null = null;

    const minVp = o.minVariantPrice && typeof o.minVariantPrice === 'object' ? (o.minVariantPrice as Record<string, unknown>) : null;
    const pr = o.priceRange && typeof o.priceRange === 'object' ? (o.priceRange as Record<string, unknown>) : null;
    const minPr = pr?.minVariantPrice && typeof pr.minVariantPrice === 'object' ? (pr.minVariantPrice as Record<string, unknown>) : null;

    amount =
      majorUnitsFromMoneyLike(minPr) ??
      majorUnitsFromMoneyLike(minVp) ??
      (typeof o.price === 'object' && o.price !== null
        ? majorUnitsFromMoneyLike(o.price as Record<string, unknown>)
        : normalizeShopifyAmountToMajorUnits(o.price, 'PLN')) ??
      (typeof o.compareAtPrice === 'object' && o.compareAtPrice !== null
        ? majorUnitsFromMoneyLike(o.compareAtPrice as Record<string, unknown>)
        : normalizeShopifyAmountToMajorUnits(o.compareAtPrice, 'PLN'));

    const variants = o.variants;
    if (amount === null && Array.isArray(variants) && variants.length > 0) {
      const v0 = variants[0];
      if (v0 && typeof v0 === 'object') {
        const vv = v0 as Record<string, unknown>;
        const pv = vv.price;
        amount =
          (typeof pv === 'object' && pv !== null
            ? majorUnitsFromMoneyLike(pv as Record<string, unknown>)
            : normalizeShopifyAmountToMajorUnits(pv, 'PLN')) ??
          (vv.priceRange && typeof vv.priceRange === 'object'
            ? majorUnitsFromMoneyLike(
                (vv.priceRange as Record<string, unknown>).minVariantPrice &&
                  typeof (vv.priceRange as Record<string, unknown>).minVariantPrice === 'object'
                  ? ((vv.priceRange as Record<string, unknown>).minVariantPrice as Record<string, unknown>)
                  : null,
              )
            : null);
      }
    }

    const urlHints: string[] = [];
    if (urlRaw) {
      urlHints.push(urlRaw);
      try {
        const u = new URL(urlRaw, 'https://example.com');
        urlHints.push(u.pathname);
      } catch {
        /* ignore */
      }
    }

    if (amount !== null && amount > 0 && (handle || urlHints.length > 0)) {
      pushRef(amount, handle, urlHints);
    }

    for (const v of Object.values(o)) visit(v, depth - 1);
  };

  visit(unwrapped, 12);
  return out;
}

/** Wyciąga segment ścieżki `/products/{handle}` ze znanych domen sklepu. */
export function extractProductHandleFromUrl(urlStr: string): string | null {
  try {
    const u = new URL(urlStr);
    const m = /\/products\/([^/?#]+)/i.exec(u.pathname);
    if (m?.[1]) return decodeURIComponent(m[1]).trim();
  } catch {
    const m = /\/products\/([^/?#]+)/i.exec(urlStr);
    if (m?.[1]) return decodeURIComponent(m[1]).trim();
  }
  return null;
}

/** Parsuje liczbę zapisana jak w PL: spacje jako separator tys., przecinek dzies. */
export function parsePlnAmountToken(raw: string): number | null {
  const t = raw.replace(/\s/g, '').replace(',', '.');
  const n = parseFloat(t);
  if (!Number.isFinite(n) || n <= 0) return null;
  return n;
}

/**
 * Wyciąga kwoty z tekstu asystenta (wzorce "... zł").
 */
export function extractPlnAmountsFromAssistantText(text: string): number[] {
  const amounts = new Set<number>();
  const re = /(\d[\d\s]{0,12}(?:[\.,]\d+)?)\s*zł/giu;
  let m: RegExpExecArray | null;
  while ((m = re.exec(text)) !== null) {
    const n = parsePlnAmountToken(m[1] ?? '');
    if (n !== null) amounts.add(n);
  }
  return [...amounts];
}

function nearestCatalogAmount(stated: number, refs: number[]): { nearest: number; ratio: number } | null {
  if (refs.length === 0) return null;
  let best = refs[0]!;
  let bestRatio = Math.abs(stated - best) / best;
  for (let i = 1; i < refs.length; i++) {
    const r = refs[i]!;
    const ratio = Math.abs(stated - r) / r;
    if (ratio < bestRatio) {
      bestRatio = ratio;
      best = r;
    }
  }
  return { nearest: best, ratio: bestRatio };
}

export type PricingGuardOutcome = {
  text: string;
  sanitized: boolean;
  /** Metryka / log — bez zmiany treści gdy sanitized=false */
  log?: Record<string, unknown>;
};

/**
 * Jeśli odpowiedź zawiera kwoty rozjechane względem katalogu — podmienia na bezpieczny komunikat.
 */
export function guardAssistantPricingAgainstCatalog(
  assistantText: string,
  catalogSnapshots: readonly unknown[],
  opts?: { maxRatio?: number; sessionId?: string },
): PricingGuardOutcome {
  const maxRatio = opts?.maxRatio ?? PRICING_MISMATCH_MAX_RATIO;
  const trimmed = assistantText.trim();
  if (!trimmed || catalogSnapshots.length === 0) {
    return { text: assistantText, sanitized: false };
  }

  const allRefs: ProductPriceRef[] = [];
  for (const snap of catalogSnapshots) {
    allRefs.push(...extractProductPriceRefsFromCatalogSnapshot(snap));
  }
  if (allRefs.length === 0) return { text: assistantText, sanitized: false };

  const refAmounts = allRefs.map((r) => r.amountPln);

  const linkWithPriceMismatch: Array<{
    handle: string | null;
    stated: number;
    catalog: number;
    ratio: number;
  }> = [];

  const mdLink = /\[([^\]]*)\]\((https?:[^)\s]+)\)/gi;
  let lm: RegExpExecArray | null;
  while ((lm = mdLink.exec(assistantText)) !== null) {
    const url = lm[2]!;
    const handle = extractProductHandleFromUrl(url);
    if (!handle) continue;

    const refsForProduct = allRefs.filter(
      (r) =>
        (r.handle && r.handle.toLowerCase() === handle.toLowerCase()) ||
        r.urlHints.some((h) => h.toLowerCase().includes(`/products/${handle.toLowerCase()}`)),
    );
    if (refsForProduct.length === 0) continue;

    const windowEnd = Math.min(assistantText.length, lm.index + 420);
    const chunk = assistantText.slice(lm.index, windowEnd);
    const priceMatch = chunk.match(/(\d[\d\s]{0,12}(?:[\.,]\d+)?)\s*zł/i);
    if (!priceMatch?.[1]) continue;

    const stated = parsePlnAmountToken(priceMatch[1]);
    if (stated === null) continue;

    const catalogAmt = Math.min(...refsForProduct.map((r) => r.amountPln));
    const ratio = Math.abs(stated - catalogAmt) / catalogAmt;
    if (ratio > maxRatio) {
      linkWithPriceMismatch.push({
        handle,
        stated,
        catalog: catalogAmt,
        ratio,
      });
    }
  }

  if (linkWithPriceMismatch.length > 0) {
    const worst = linkWithPriceMismatch.reduce((a, b) => (a.ratio >= b.ratio ? a : b));
    return {
      text: PRICING_SAFE_FALLBACK_MESSAGE_PL,
      sanitized: true,
      log: {
        tag: 'chat.pricing_mismatch',
        reason: 'markdown_link_price_deviation',
        session_id: opts?.sessionId ?? null,
        handle: worst.handle,
        stated_amount: worst.stated,
        catalog_amount: worst.catalog,
        deviation_ratio: Number(worst.ratio.toFixed(4)),
        max_ratio: maxRatio,
      },
    };
  }

  const floatingAmounts = extractPlnAmountsFromAssistantText(assistantText);
  if (floatingAmounts.length === 0) return { text: assistantText, sanitized: false };

  if (refAmounts.length === 1) {
    const catalogAmt = refAmounts[0]!;
    for (const stated of floatingAmounts) {
      const ratio = Math.abs(stated - catalogAmt) / catalogAmt;
      if (ratio > maxRatio) {
        return {
          text: PRICING_SAFE_FALLBACK_MESSAGE_PL,
          sanitized: true,
          log: {
            tag: 'chat.pricing_mismatch',
            reason: 'single_catalog_price_global_deviation',
            session_id: opts?.sessionId ?? null,
            stated_amount: stated,
            catalog_amount: catalogAmt,
            deviation_ratio: Number(ratio.toFixed(4)),
            max_ratio: maxRatio,
          },
        };
      }
    }
    return { text: assistantText, sanitized: false };
  }

  for (const stated of floatingAmounts) {
    const nn = nearestCatalogAmount(stated, refAmounts);
    if (!nn) continue;
    if (nn.ratio > maxRatio) {
      return {
        text: PRICING_SAFE_FALLBACK_MESSAGE_PL,
        sanitized: true,
        log: {
          tag: 'chat.pricing_mismatch',
          reason: 'nearest_reference_deviation',
          session_id: opts?.sessionId ?? null,
          stated_amount: stated,
          nearest_catalog_amount: nn.nearest,
          deviation_ratio: Number(nn.ratio.toFixed(4)),
          max_ratio: maxRatio,
          catalog_reference_count: refAmounts.length,
        },
      };
    }
  }

  return { text: assistantText, sanitized: false };
}
