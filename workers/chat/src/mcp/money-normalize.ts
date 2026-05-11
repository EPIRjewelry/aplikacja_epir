/**
 * Normalizacja kwot Shopify / MCP: część ścieżek zwraca `amount` w groszach jako liczbę całkowitą
 * (np. 28000 = 280 PLN), podczas gdy Storefront GraphQL typowo podaje major jako string z miejscami dziesiętnymi.
 */

function parseDecimalMajor(raw: string): number | null {
  const n = parseFloat(raw.replace(/\s/g, '').replace(',', '.'));
  if (!Number.isFinite(n) || n <= 0) return null;
  return n;
}

/**
 * Zamiana surowego `amount` na jednostki główne (np. PLN), bez mylenia groszy z złotówkami.
 *
 * Dla PLN: jeśli wartość jest **liczbą całkowitą ≥ 10 000** i podzielną przez 100 **oraz**
 * nie wygląda na zapis z częścią dziesiętną (np. "280.00"), traktujemy jako **grosze** → /100.
 * Dzięki temu 28000 → 280, a "280.00" / 280 → nadal 280 PLN.
 */
export function normalizeShopifyAmountToMajorUnits(raw: unknown, currencyCode: string): number | null {
  const cc = currencyCode.trim().toUpperCase();
  if (cc !== 'PLN') {
    if (typeof raw === 'number' && Number.isFinite(raw) && raw > 0) return raw;
    if (typeof raw === 'string') return parseDecimalMajor(raw);
    return null;
  }

  if (typeof raw === 'number' && Number.isFinite(raw) && raw > 0) {
    const n = raw;
    if (!Number.isInteger(n)) return n;
    if (n >= 10000 && n % 100 === 0) return n / 100;
    return n;
  }

  if (typeof raw === 'string') {
    const t = raw.trim();
    if (/[.,]\d/.test(t)) {
      return parseDecimalMajor(t);
    }
    const digitsOnly = t.replace(/\s/g, '');
    if (/^\d+$/.test(digitsOnly)) {
      const n = parseInt(digitsOnly, 10);
      if (!Number.isFinite(n) || n <= 0) return null;
      if (n >= 10000 && n % 100 === 0) return n / 100;
      return n;
    }
    return parseDecimalMajor(t);
  }

  return null;
}

/** Odczyt kwoty z węzła Money po enrich (price_minor) lub surowego Money (amount). */
export function majorUnitsFromMoneyLike(
  node: Record<string, unknown> | null,
  currencyFallback = 'PLN',
): number | null {
  if (!node) return null;

  const cur =
    (typeof node.currency === 'string' && node.currency) ||
    (typeof node.currencyCode === 'string' && node.currencyCode) ||
    currencyFallback;

  if (typeof node.price_minor === 'number' && Number.isFinite(node.price_minor) && node.price_minor > 0) {
    const cc = String(cur).trim().toUpperCase();
    if (cc === 'PLN') return node.price_minor / 100;
  }

  if (node.amount !== undefined) {
    return normalizeShopifyAmountToMajorUnits(node.amount, String(cur));
  }

  return null;
}
