import type {ChannelMode} from '../../../src/buyer/channel-switch';

export function makeGemmaChannelKv(
  modes: Partial<Record<string, ChannelMode | 'maybe'>>,
): KVNamespace {
  return {
    async get(key: string) {
      const hit = Object.entries(modes).find(([suffix]) => key.endsWith(suffix));
      if (!hit) return null;
      return hit[1] as string;
    },
  } as KVNamespace;
}
