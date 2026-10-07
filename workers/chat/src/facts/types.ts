import type {CardStoneOrigin} from '../catalog/stone-origin';

export type ProductImageFact = {
  url: string;
  alt?: string;
};

export type VariantFacts = {
  variant_id: string;
  title?: string;
  available: boolean;
  price_display_pl?: string;
  price_minor?: number;
  metal?: string | null;
  size?: string | null;
  stone_origin?: CardStoneOrigin;
  image?: ProductImageFact;
  options?: Array<{name: string; value: string}>;
};

export type ProductFacts = {
  product_id: string;
  handle?: string;
  title?: string;
  url?: string;
  vendor?: string;
  collections: string[];
  image?: ProductImageFact;
  origin_on_card?: string;
  variants: VariantFacts[];
};
