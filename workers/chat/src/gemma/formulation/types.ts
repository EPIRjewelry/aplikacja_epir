import type {BuyerChannelId} from '../../buyer/channel-switch';
import type {GemmaConversationState, GemmaSlots} from '../state/types';

export type FormulationProductRef = {
  ref: string;
  url: string;
  priceDisplay: string;
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
