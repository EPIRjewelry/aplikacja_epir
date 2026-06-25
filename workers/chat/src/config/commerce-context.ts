/**
 * Domyślny kontekst commerce (UCP catalog + polityki MCP) per storefront.
 */

export type CommerceContext = {
  language: string;
  currency: string;
  address_country: string;
  market: string;
  locale: string;
};

const PL_DEFAULT: CommerceContext = {
  language: 'pl-PL',
  currency: 'PLN',
  address_country: 'PL',
  market: 'PL',
  locale: 'pl',
};

const STOREFRONT_COMMERCE: Record<string, Partial<CommerceContext>> = {
  kazka: PL_DEFAULT,
  zareczyny: PL_DEFAULT,
  epir: PL_DEFAULT,
  'online-store': PL_DEFAULT,
  'epir-liquid': PL_DEFAULT,
  'epirbizuteria.pl': PL_DEFAULT,
};

function normalizeLocaleTag(raw?: string | null): string | undefined {
  if (!raw || typeof raw !== 'string') return undefined;
  const trimmed = raw.trim();
  return trimmed.length > 0 ? trimmed : undefined;
}

function localeToLanguage(locale: string): string {
  if (locale.includes('-')) return locale;
  if (locale === 'pl') return 'pl-PL';
  if (locale === 'en') return 'en';
  return locale;
}

export function resolveCommerceContext(
  storefrontKey?: string | null,
  overrides?: { locale?: string | null; market?: string | null },
): CommerceContext {
  const base = {
    ...PL_DEFAULT,
    ...(storefrontKey && STOREFRONT_COMMERCE[storefrontKey]
      ? STOREFRONT_COMMERCE[storefrontKey]
      : {}),
  };

  const localeOverride = normalizeLocaleTag(overrides?.locale);
  const marketOverride = normalizeLocaleTag(overrides?.market);

  if (localeOverride) {
    base.locale = localeOverride;
    base.language = localeToLanguage(localeOverride);
  }
  if (marketOverride) {
    base.market = marketOverride;
  }

  return base;
}

export function mergeCatalogCommerceContext(
  existing: Record<string, unknown> | undefined,
  commerce: CommerceContext,
): Record<string, unknown> {
  const context = existing && typeof existing === 'object' ? { ...existing } : {};
  if (typeof context.language !== 'string' || !context.language.trim()) {
    context.language = commerce.language;
  }
  if (typeof context.currency !== 'string' || !context.currency.trim()) {
    context.currency = commerce.currency;
  }
  if (typeof context.address_country !== 'string' || !context.address_country.trim()) {
    context.address_country = commerce.address_country;
  }
  return context;
}
