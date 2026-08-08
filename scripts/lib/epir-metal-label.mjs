/**
 * Klasyfikacja srebro / złoto dla custom_label_2 (GMC / PMax).
 * Reguły zgodne z scripts/update-hs-codes.mjs (vendor + heurystyka tytułu).
 */

export const SILVER_LABEL = 'Srebro';
export const GOLD_LABEL = 'Zloto';
export const REQUIRED_TEMPLATE_SUFFIX = 'nowy-szablon';
/** Dedykowany szablon PDP linii złotej (feed + PMax custom_label_2). */
export const GOLD_TEMPLATE_SUFFIX = 'pierscionek-zloto-turmali';
export const FEED_ELIGIBLE_TEMPLATE_SUFFIXES = [
  REQUIRED_TEMPLATE_SUFFIX,
  GOLD_TEMPLATE_SUFFIX,
];
export const GY_PUBLICATION_ID = 'gid://shopify/Publication/44911067241';

/** vendor (lowercase) → domyślna linia metalu */
const VENDOR_METAL = {
  'epir art silver jewellery': SILVER_LABEL,
  'epir art jewellery&gemstone': SILVER_LABEL,
  'epir art silver': SILVER_LABEL,
  'epir art gold': GOLD_LABEL,
};

export function normalizeVendor(vendor) {
  return String(vendor || '')
    .trim()
    .toLowerCase();
}

/**
 * Złoto lite z tytułu — wyklucza pozłotę i metaforyczne „Złoty piasek/pył/powiew”.
 * @param {string|null|undefined} title
 */
export function isSolidGoldTitle(title) {
  const t = String(title || '').toLowerCase();
  if (!t) return false;
  if (/pozłac|pozlac|gold[\s-]?plat/.test(t)) return false;
  if (/srebr|silver|\b925\b/.test(t)) return false;
  if (/złoty\s+(piasek|pył|pyl|powiew)/.test(t)) return false;
  return (
    /żółt\w*\s+złot/.test(t) ||
    /biał\w*\s+złot/.test(t) ||
    /\b(14|18)\s*k\b/.test(t) ||
    /\bau\s?(585|750)\b/.test(t) ||
    /\bzłot[yae]\s+(pierścionek|obrączk\w*|obraczk\w*|wisior|naszyjnik|bransolet\w*|kolczyk\w*)/.test(
      t,
    ) ||
    /\b(pierścionek|obrączk\w*|obraczk\w*|wisior|naszyjnik|bransolet\w*|kolczyk\w*)\w*\s+złot/.test(
      t,
    ) ||
    /\bzłot\w*\s+z (topazem|moissanitem|szafirem|ametystem|rubinem|opalem)/.test(t)
  );
}

/**
 * @param {string|null|undefined} vendor
 * @param {string|null|undefined} [title]
 * @returns {'Srebro'|'Zloto'|null}
 */
export function classifyMetalLabel(vendor, title, templateSuffix) {
  if (isGoldTemplate(templateSuffix)) return GOLD_LABEL;
  if (isSolidGoldTitle(title)) return GOLD_LABEL;
  const fromVendor = VENDOR_METAL[normalizeVendor(vendor)];
  return fromVendor || null;
}

export function isGoldTemplate(templateSuffix) {
  return String(templateSuffix || '').trim() === GOLD_TEMPLATE_SUFFIX;
}

export function isFeedEligibleTemplate(templateSuffix) {
  const s = String(templateSuffix || '').trim();
  return FEED_ELIGIBLE_TEMPLATE_SUFFIXES.includes(s);
}

/** @deprecated użyj isFeedEligibleTemplate */
export function isRequiredTemplate(templateSuffix) {
  return isFeedEligibleTemplate(templateSuffix);
}

export function isKazkaProduct(vendor, tags) {
  const v = normalizeVendor(vendor);
  if (v === 'kazka') return true;
  const list = Array.isArray(tags) ? tags : [];
  return list.some((t) => String(t).trim().toLowerCase() === 'kazka');
}

export function hasSprzedaneTag(tags) {
  const list = Array.isArray(tags) ? tags : [];
  return list.some((t) => String(t).trim().toLowerCase() === 'sprzedane');
}

