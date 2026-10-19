import type {BuyerChannelId} from '../../buyer/channel-switch';
import type {GemmaConversationState, GemmaSlots} from '../state/types';

export type CatalogFilterContext = {
  metal?: string[];
  priceMax?: import('../../facts/types').MoneyPln;
};

export type FormulationProductRef = {
  ref: string;
  url: string;
  priceDisplay: string;
  /** Nazwa z karty produktu (fakty kodu, kanon §2.2) — model nie zgaduje, co jest pod refem. */
  title: string;
  available: boolean;
};

export type TurnFacts = {
  channelId: BuyerChannelId;
  state: GemmaConversationState;
  missingSlot?: keyof GemmaSlots;
  allowedRefs: string[];
  products: FormulationProductRef[];
  kbAnswer: string | null;
  allowedUrls: string[];
  allowedNumbers: string[];
};

export type ParsedFormulation = {
  text: string;
  product_refs: string[];
};
