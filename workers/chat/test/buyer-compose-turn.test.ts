import { beforeEach, describe, expect, it, vi } from 'vitest';

import {
  buildBuyerToolsPrompt,
  buildBuyerTurnSystemPrompt,
  composeBuyerAssistantReply,
  factsContextBlock,
  filterToolsForSession,
} from '../src/buyer/compose-buyer-turn';
import { buildBuyerToolDefinitions } from '../src/buyer/buyer-tools';
import * as toolReadiness from '../src/buyer/tool-readiness';
import * as aiProfile from '../src/ai-profile';
import * as aiClient from '../src/ai-client';
import * as facts from '../src/facts';

const SAMPLE_VARIANT_GID = 'gid://shopify/ProductVariant/ALLOWED_IN_FACTS';

describe('factsContextBlock variant lines', () => {
  const products = [
    {
      title: 'Pierścionek',
      priceDisplay: '1 200 zł',
      variants: [{ variantId: SAMPLE_VARIANT_GID, title: 'rozmiar 14' }],
    },
  ];

  it('includes variant gid when ucp_cart is available in the turn', () => {
    const block = factsContextBlock(products, { includeVariants: true });
    expect(block).toContain(SAMPLE_VARIANT_GID);
    expect(block).toContain('wariant: rozmiar 14 — id:');
  });

  it('omits variant gid when ucp_cart is not available', () => {
    const block = factsContextBlock(products, { includeVariants: false });
    expect(block).not.toContain(SAMPLE_VARIANT_GID);
    expect(block).not.toContain('wariant:');
  });
});

describe('buyer compose turn — tools in system prompt', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it('buildBuyerToolsPrompt with no tools does not mention search_catalog or get_size_table', () => {
    const block = buildBuyerToolsPrompt([]);
    expect(block).not.toContain('search_catalog');
    expect(block).not.toContain('get_size_table');
  });

  it('buildBuyerTurnSystemPrompt with no ready tools omits search_catalog and get_size_table', () => {
    const system = buildBuyerTurnSystemPrompt({
      availableTools: [],
      profilePrompt: '',
      factsBlock: '',
    });
    expect(system).not.toContain('search_catalog');
    expect(system).not.toContain('get_size_table');
  });

  it('buildBuyerTurnSystemPrompt lists only readiness-passed tools', () => {
    const system = buildBuyerTurnSystemPrompt({
      availableTools: ['search_catalog'],
      profilePrompt: '',
      factsBlock: '',
    });
    expect(system).toContain('search_catalog');
    expect(system).not.toContain('get_size_table');
  });

  it('(b) without session_id cart tools are filtered from tools', () => {
    const filtered = filterToolsForSession(
      ['ucp_cart', 'get_size_table', 'search_shop_policies_and_faqs'],
      undefined,
    );
    expect(filtered).not.toContain('ucp_cart');
    expect(filtered).toContain('get_size_table');
    const defs = buildBuyerToolDefinitions(filtered);
    const names = defs.map((d) => d.function.name);
    expect(names).not.toContain('create_cart');
    expect(names).not.toContain('get_cart');
  });

  it('composeBuyerAssistantReply system message follows listAvailableBuyerTools', async () => {
    vi.spyOn(toolReadiness, 'listAvailableBuyerTools').mockResolvedValue([]);
    vi.spyOn(aiProfile, 'fetchAIProfileByHandle').mockResolvedValue(null);
    vi.spyOn(facts, 'getCatalogRepository').mockRejectedValue(new Error('skip'));

    let systemContent = '';
    vi.spyOn(aiClient, 'getGroqResponse').mockImplementation(async (messages) => {
      const system = messages.find((m) => m.role === 'system');
      systemContent = typeof system?.content === 'string' ? system.content : '';
      return 'ok';
    });

    const env = { SHOP_DOMAIN: 'shop.myshopify.com' } as import('../src/config/bindings').Env;
    const req = new Request('https://example.com/chat', { method: 'POST' });
    await composeBuyerAssistantReply(env, 'epir-online-store', 'Cześć', req);

    expect(toolReadiness.listAvailableBuyerTools).toHaveBeenCalled();
    expect(systemContent).not.toContain('search_catalog');
    expect(systemContent).not.toContain('get_size_table');
  });

  it('tools=[] path uses getGroqResponse (no stream tool loop)', async () => {
    vi.spyOn(toolReadiness, 'listAvailableBuyerTools').mockResolvedValue(['ucp_cart']);
    vi.spyOn(aiProfile, 'fetchAIProfileByHandle').mockResolvedValue(null);
    vi.spyOn(facts, 'getCatalogRepository').mockRejectedValue(new Error('skip'));
    const streamSpy = vi.spyOn(aiClient, 'streamGroqEvents');
    const groqSpy = vi.spyOn(aiClient, 'getGroqResponse').mockResolvedValue('bez narzędzi');

    const env = { SHOP_DOMAIN: 'shop.myshopify.com' } as import('../src/config/bindings').Env;
    const req = new Request('https://example.com/chat', { method: 'POST' });
    // no sessionId → ucp_cart filtered → empty definitions → getGroqResponse
    const reply = await composeBuyerAssistantReply(env, 'epir-online-store', 'Cześć', req);

    expect(reply).toBe('bez narzędzi');
    expect(groqSpy).toHaveBeenCalled();
    expect(streamSpy).not.toHaveBeenCalled();
  });
});
