import { beforeEach, describe, expect, it, vi } from 'vitest';

import {
  buildBuyerToolsPrompt,
  buildBuyerTurnSystemPrompt,
  composeBuyerAssistantReply,
  factsContextBlock,
  filterToolsForSession,
} from '../src/buyer/compose-buyer-turn';
import { buildBuyerToolDefinitions, filterModelWiredBuyerTools } from '../src/buyer/buyer-tools';
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
      modelTools: [],
      profilePrompt: '',
      factsBlock: '',
    });
    expect(system).not.toContain('search_catalog');
    expect(system).not.toContain('get_size_table');
  });

  it('(a) availableTools with search_catalog → prompt/defs omit search_catalog aliases', () => {
    const modelTools = filterModelWiredBuyerTools([
      'search_catalog',
      'ucp_cart',
      'get_size_table',
      'search_shop_policies_and_faqs',
    ]);
    const system = buildBuyerTurnSystemPrompt({
      modelTools,
      profilePrompt: '',
      factsBlock: '[FAKTY Z KATALOGU — tylko to możesz twierdzić]\n- Pierścionek',
    });
    expect(system).not.toContain('search_catalog');
    expect(system).not.toContain('catalog_search');
    expect(system).not.toContain('lookup_catalog');
    expect(system).toContain('[FAKTY Z KATALOGU');
    const names = buildBuyerToolDefinitions(['search_catalog', ...modelTools]).map(
      (d) => d.function.name,
    );
    expect(names).not.toContain('search_catalog');
  });

  it('(b) customer_account_profile omitted from prompt and Groq defs', () => {
    const modelTools = filterModelWiredBuyerTools([
      'customer_account_profile',
      'get_size_table',
    ]);
    const system = buildBuyerTurnSystemPrompt({
      modelTools,
      profilePrompt: '',
      factsBlock: '',
    });
    expect(system).not.toContain('customer_account_profile');
    const names = buildBuyerToolDefinitions(['customer_account_profile', ...modelTools]).map(
      (d) => d.function.name,
    );
    expect(names).not.toContain('customer_account_profile');
    expect(names).toContain('get_size_table');
  });

  it('(d) ucp_cart / policies / size remain in prompt and definitions', () => {
    const modelTools: toolReadiness.BuyerToolId[] = [
      'ucp_cart',
      'search_shop_policies_and_faqs',
      'get_size_table',
    ];
    const system = buildBuyerTurnSystemPrompt({
      modelTools,
      profilePrompt: '',
      factsBlock: '',
    });
    expect(system).toContain('create_cart');
    expect(system).toContain('search_shop_policies_and_faqs');
    expect(system).toContain('get_size_table');
    const names = buildBuyerToolDefinitions(modelTools).map((d) => d.function.name);
    expect(names).toEqual(
      expect.arrayContaining([
        'create_cart',
        'get_cart',
        'update_cart',
        'cancel_cart',
        'search_shop_policies_and_faqs',
        'get_size_table',
      ]),
    );
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

  it('(c) tool_use_failed in round 0 → getGroqResponse without tools, same system facts', async () => {
    vi.spyOn(toolReadiness, 'listAvailableBuyerTools').mockResolvedValue([
      'ucp_cart',
      'search_catalog',
      'get_size_table',
      'search_shop_policies_and_faqs',
    ]);
    vi.spyOn(aiProfile, 'fetchAIProfileByHandle').mockResolvedValue(null);
    vi.spyOn(facts, 'getCatalogRepository').mockResolvedValue({
      search: async () => ({
        matches: [
          {
            product: {
              title: 'Pierścionek test',
              priceRange: { min: { display_pl: '900 zł' }, max: { display_pl: '900 zł' } },
              variants: [{ variantId: SAMPLE_VARIANT_GID, title: '14' }],
            },
            matchingPriceRange: { min: { display_pl: '900 zł' }, max: { display_pl: '900 zł' } },
            matchingVariants: [{ variantId: SAMPLE_VARIANT_GID, title: '14' }],
          },
        ],
      }),
    } as never);

    vi.spyOn(aiClient, 'streamGroqEvents').mockRejectedValue(
      new Error('AI Gateway stream error event from Groq'),
    );
    const groqSpy = vi.spyOn(aiClient, 'getGroqResponse').mockResolvedValue('odpowiedź z faktów');

    const env = { SHOP_DOMAIN: 'shop.myshopify.com' } as import('../src/config/bindings').Env;
    const req = new Request('https://example.com/chat', { method: 'POST' });
    const reply = await composeBuyerAssistantReply(env, 'epir-online-store', 'pierścionek', req, {
      sessionId: 'sess-fallback-test',
    });

    expect(reply).toBe('odpowiedź z faktów');
    expect(groqSpy).toHaveBeenCalledTimes(1);
    const messages = groqSpy.mock.calls[0]?.[0] as aiClient.GroqMessage[];
    const system = messages.find((m) => m.role === 'system');
    const systemContent = typeof system?.content === 'string' ? system.content : '';
    expect(systemContent).toContain('[FAKTY Z KATALOGU');
    expect(systemContent).toContain('Pierścionek test');
    expect(systemContent).not.toContain('search_catalog');
    // getGroqResponse has no tools arg — only messages + env + options
    expect(groqSpy.mock.calls[0]?.length).toBeLessThanOrEqual(3);
  });
});
