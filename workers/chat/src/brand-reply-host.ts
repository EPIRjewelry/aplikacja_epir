/**
 * GE (EPIR, epirbizuteria.pl) i GK (Kazka, kazka.epirbizuteria.pl) nie linkują do siebie.
 * Filtr jest na tekście odpowiedzi, więc zły host nie przechodzi nawet gdy model go wymyśli.
 */

function isKazkaCatalogBrand(brand?: string): boolean {
  const b = brand?.trim().toLowerCase();
  return b === 'kazka' || b === 'kazka jewelry';
}

function isEpirCatalogBrand(brand?: string): boolean {
  const b = brand?.trim().toLowerCase();
  return b === 'epir' || b === 'epir art jewellery' || b === 'online-store';
}

export const EPIR_STORE_HOST = 'epirbizuteria.pl';
export const KAZKA_STORE_HOST = 'kazka.epirbizuteria.pl';

const MD_LINK = /\[([^\]]*)\]\((https?:\/\/[^)\s]+)\)/gi;
const BARE_URL = /https?:\/\/[^\s)\]>'"]+/gi;

export type BrandHostSide = 'epir' | 'kazka';

export function brandHostSide(brand?: string): BrandHostSide | null {
  if (isKazkaCatalogBrand(brand)) return 'kazka';
  const normalized = brand?.trim().toLowerCase();
  if (!normalized) return null;
  if (
    isEpirCatalogBrand(normalized) ||
    normalized === 'zareczyny' ||
    normalized === 'hydrogen-zareczyny' ||
    normalized === 'online-store'
  ) {
    return 'epir';
  }
  return null;
}

export function urlHost(raw: string): string | null {
  try {
    return new URL(raw).hostname.toLowerCase().replace(/\.$/, '');
  } catch {
    return null;
  }
}

/** EPIR nie może wskazać hosta Kazka. Kazka nie może wskazać apexu (www albo bez www). */
export function isForeignBrandHost(host: string, side: BrandHostSide): boolean {
  const normalized = host.toLowerCase().replace(/\.$/, '');
  if (side === 'epir') return normalized === KAZKA_STORE_HOST;
  return normalized === EPIR_STORE_HOST || normalized === `www.${EPIR_STORE_HOST}`;
}

export function stripForeignBrandLinks(
  text: string,
  brand?: string,
): {text: string; stripped: boolean; removed: string[]} {
  const side = brandHostSide(brand);
  if (!side || !text) return {text, stripped: false, removed: []};
  const removed: string[] = [];

  const foreign = (url: string): boolean => {
    const host = urlHost(url);
    if (!host || !isForeignBrandHost(host, side)) return false;
    removed.push(url);
    return true;
  };

  const withoutMarkdown = text.replace(MD_LINK, (full, label: string, url: string) => {
    if (!foreign(url)) return full;
    return label.trim();
  });
  const withoutBare = withoutMarkdown.replace(BARE_URL, (url) => {
    const trimmed = url.replace(/[.,;:]+$/g, '');
    const suffix = url.slice(trimmed.length);
    if (!foreign(trimmed)) return url;
    return suffix;
  });
  const withoutHost = stripBareForeignHost(withoutBare, side, removed);
  return {text: withoutHost, stripped: removed.length > 0, removed};
}

/** Host wpisany bez schematu. Kazka zostaje na `kazka.epirbizuteria.pl`. */
function stripBareForeignHost(text: string, side: BrandHostSide, removed: string[]): string {
  if (side === 'epir') {
    return text.replace(/(?<![\w./-])kazka\.epirbizuteria\.pl\b[^\s)\]>]*/gi, (host) => {
      removed.push(host);
      return '';
    });
  }
  return text.replace(/(?<![\w/-])(?<!kazka\.)(?:www\.)?epirbizuteria\.pl\b[^\s)\]>]*/gi, (host) => {
    removed.push(host);
    return '';
  });
}
