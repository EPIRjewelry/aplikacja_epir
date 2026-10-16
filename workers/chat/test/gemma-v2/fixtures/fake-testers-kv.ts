import type {BuyerChannelId} from '../../../src/buyer/channel-switch';
import {channelKvKey, coreKvKey} from '../../../src/buyer/channel-switch';
import {GEMMA_TESTERS_KV_KEY} from '../../../src/gemma/internal-access';

export function makeGemmaRuntimeKv(
  options: {
    channelMode?: string;
    coreMode?: string;
    testers?: string[];
    channelId?: BuyerChannelId;
  } = {},
): KVNamespace {
  const channelId = options.channelId ?? 'epir-online-store';
  return {
    async get(key: string) {
      if (key === channelKvKey(channelId)) return options.channelMode ?? 'on';
      if (key === coreKvKey(channelId)) return options.coreMode ?? null;
      if (key === GEMMA_TESTERS_KV_KEY) {
        if (!options.testers) return null;
        return JSON.stringify(options.testers);
      }
      return null;
    },
  } as KVNamespace;
}
