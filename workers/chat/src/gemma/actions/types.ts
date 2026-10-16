import type {BuyerChannelId} from '../../buyer/channel-switch';
import type {GemmaIntent} from '../intent/schema';
import type {GemmaSessionState, GemmaShownRef} from '../state/types';
import type {TransitionResult} from '../state/machine';
import type {ProductFacts, ProductMatch} from '../../facts/types';

export type GemmaCatalogCard = {
  ref: string;
  match: ProductMatch;
  minMinor: number;
};

export type GemmaKbFacts = {
  answer: string;
  sources: Array<{title: string; url: string}>;
};

export type GemmaCartFacts = {
  needsConsent?: boolean;
  productUrl?: string;
  selectedProductId?: string;
  selectedVariantId?: string;
  continueUrl?: string;
  notices?: string[];
  totalsNote?: string | null;
  clientErrors?: string[];
  variantUnresolved?: boolean;
  cartShowSummary?: string;
};

export type GemmaActionOutcome = {
  shown: GemmaShownRef[];
  selected: GemmaSessionState['selected'];
  catalogCards: GemmaCatalogCard[];
  kb: GemmaKbFacts | null;
  cart: GemmaCartFacts | null;
  productDetail: ProductFacts | null;
  catalogFailed: boolean;
  kbFailed: boolean;
  cartFailed: boolean;
};

export type GemmaActionContext = {
  env: import('../../config/bindings').Env;
  channelId: BuyerChannelId;
  request: Request;
  sessionId: string;
  userText: string;
  userCorpus: string;
  intent: GemmaIntent;
  prev: GemmaSessionState;
  transitioned: TransitionResult;
  productHandle?: string;
};
