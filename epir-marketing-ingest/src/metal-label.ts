/**
 * Klasyfikacja srebro / złoto dla custom_label_2 (GMC / PMax).
 * Reguły zgodne z scripts/lib/epir-metal-label.mjs i update-hs-codes.mjs.
 */

export const SILVER_LABEL = 'Srebro';
export const GOLD_LABEL = 'Zloto';
export const GOLD_TEMPLATE_SUFFIX = 'pierscionek-zloto-turmali';

const VENDOR_METAL: Record<string, string> = {
  'epir art silver jewellery': SILVER_LABEL,
  'epir art jewellery&gemstone': SILVER_LABEL,
  'epir art silver': SILVER_LABEL,
  'epir art gold': GOLD_LABEL,
};

function normalizeVendor(vendor: string): string {
  return String(vendor || '')
    .trim()
    .toLowerCase();
}

/** Złoto lite z tytułu — wyklucza pozłotę i metaforyczne „Złoty piasek/pył/powiew”. */
export function isSolidGoldTitle(title: string | null | undefined): boolean {
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

export function isGoldTemplate(templateSuffix: string | null | undefined): boolean {
  return String(templateSuffix || '').trim() === GOLD_TEMPLATE_SUFFIX;
}

/** @returns Srebro | Zloto | '' */
export function classifyMetalLabel(
  vendor: string | null | undefined,
  title: string | null | undefined,
  templateSuffix?: string | null,
): string {
  if (isGoldTemplate(templateSuffix)) return GOLD_LABEL;
  if (isSolidGoldTitle(title)) return GOLD_LABEL;
  return VENDOR_METAL[normalizeVendor(vendor ?? '')] ?? '';
}
