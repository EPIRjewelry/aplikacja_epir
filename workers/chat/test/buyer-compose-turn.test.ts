import { beforeEach, describe, expect, it, vi } from 'vitest';

import {
  buildBuyerToolsPrompt,
  buildBuyerTurnSystemPrompt,
  composeBuyerAssistantReply,
  factsContextBlock,
  filterToolsForSession,
  scrubGidFromClientReply,
} from '../src/buyer/compose-buyer-turn';
import { buildBuyerToolDefinitions, filterModelWiredBuyerTools } from '../src/buyer/buyer-tools';
import { LUXURY_SYSTEM_PROMPT } from '../src/prompts/luxury-system-prompt';
import * as toolReadiness from '../src/buyer/tool-readiness';
import * as executeBuyerToolMod from '../src/buyer/execute-buyer-tool';
import * as aiProfile from '../src/ai-profile';
import * as aiClient from '../src/ai-client';
import * as facts from '../src/facts';
import * as sessionHistory from '../src/buyer/session-history';

function toolCallOnlyStream(name: string, id: string): ReadableStream<aiClient.GroqStreamEvent> {
  return new ReadableStream({
    start(controller) {
      controller.enqueue({
        type: 'tool_call',
        call: { id, name, arguments: '{}' },
      });
      controller.close();
    },
  });
}

const SAMPLE_VARIANT_GID = 'gid://shopify/ProductVariant/ALLOWED_IN_FACTS';

describe('factsContextBlock variant lines', () => {
  const products = [
    {
      title: 'Pierścionek',
      priceDisplay: '1 200 zł',
      url: 'https://shop.example/products/pierscionek',
      metals: ['srebro'],
      stones: ['topaz'],
      variants: [
        {
          variantId: SAMPLE_VARIANT_GID,
          title: 'rozmiar 14',
          weight: 5,
          weightUnit: 'GRAMS',
        },
      ],
    },
  ];

  it('puts variant gid only in DANE TECHNICZNE section', () => {
    const block = factsContextBlock(products);
    const [descriptive] = block.split('[DANE TECHNICZNE');
    expect(descriptive).not.toContain(SAMPLE_VARIANT_GID);
    expect(block).toContain(SAMPLE_VARIANT_GID);
    expect(block).toContain('metal: srebro');
    expect(block).toMatch(/waga:\s*5 g/);
    expect(block).toContain('https://shop.example/products/pierscionek');
  });
});

describe('scrubGidFromClientReply', () => {
  it('removes gid patterns and logs scrub', () => {
    const warn = vi.spyOn(console, 'log').mockImplementation(() => {});
    const out = scrubGidFromClientReply(`Produkt ${SAMPLE_VARIANT_GID} gotowy.`);
    expect(out).not.toContain('gid://shopify');
    expect(warn).toHaveBeenCalled();
    warn.mockRestore();
  });

  it('preserves paragraph breaks when scrubbing gid', () => {
    const out = scrubGidFromClientReply(
      `Akapit pierwszy ${SAMPLE_VARIANT_GID} .\n\nAkapit drugi bez gid.`,
    );
    expect(out).toContain('\n\n');
    expect(out).toBe('Akapit pierwszy .\n\nAkapit drugi bez gid.');
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

  it('(e) search_catalog in prompt and defs when in modelTools (readiness passed)', () => {
    const modelTools = filterModelWiredBuyerTools([
      'search_catalog',
      'ucp_cart',
      'get_size_table',
      'search_shop_policies_and_faqs',
    ]);
    const system = buildBuyerTurnSystemPrompt({
      modelTools,
      profilePrompt: 'Profil marki test',
      factsBlock: '',
    });
    expect(system).toContain('search_catalog');
    expect(system).not.toContain('catalog_search');
    expect(system).not.toContain('price_display_pl');
    expect(system).not.toContain('karta tego nie podaje');
    expect(system).toContain('search_shop_policies_and_faqs');
    expect(system).toContain('get_size_table');
    expect(system).toContain('Pan/Pani');
    expect(system).toContain('Reguły twarde mają pierwszeństwo');
    const profileIdx = system.indexOf('Profil marki test');
    const hardIdx = system.indexOf('Reguły twarde mają pierwszeństwo');
    expect(profileIdx).toBeGreaterThan(-1);
    expect(hardIdx).toBeGreaterThan(profileIdx);
    const names = buildBuyerToolDefinitions(modelTools).map((d) => d.function.name);
    expect(names).toContain('search_catalog');
  });

  it('(h) luxury base prompt has no delivery threshold amounts', () => {
    expect(LUXURY_SYSTEM_PROMPT).not.toMatch(/wysyłka\s+\d+\s*zł/i);
    expect(LUXURY_SYSTEM_PROMPT).not.toContain('price_display_pl');
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
    vi.spyOn(sessionHistory, 'readBuyerSessionHistory').mockResolvedValue([]);

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
    expect(systemContent).not.toContain('Narzędzia dostępne w tej turze');
    expect(systemContent).not.toContain('get_size_table');
  });

  it('tools=[] path uses getGroqResponse (no stream tool loop)', async () => {
    vi.spyOn(toolReadiness, 'listAvailableBuyerTools').mockResolvedValue(['ucp_cart']);
    vi.spyOn(aiProfile, 'fetchAIProfileByHandle').mockResolvedValue(null);
    vi.spyOn(sessionHistory, 'readBuyerSessionHistory').mockResolvedValue([]);
    const streamSpy = vi.spyOn(aiClient, 'streamGroqEvents');
    const groqSpy = vi.spyOn(aiClient, 'getGroqResponse').mockResolvedValue('bez narzędzi');

    const env = { SHOP_DOMAIN: 'shop.myshopify.com' } as import('../src/config/bindings').Env;
    const req = new Request('https://example.com/chat', { method: 'POST' });
    const reply = await composeBuyerAssistantReply(env, 'epir-online-store', 'Cześć', req);

    expect(reply).toBe('bez narzędzi');
    expect(groqSpy).toHaveBeenCalled();
    expect(streamSpy).not.toHaveBeenCalled();
  });

  it('(c) tool_use_failed in round 0 → getGroqResponse without tools', async () => {
    vi.spyOn(toolReadiness, 'listAvailableBuyerTools').mockResolvedValue([
      'ucp_cart',
      'search_catalog',
      'get_size_table',
      'search_shop_policies_and_faqs',
    ]);
    vi.spyOn(aiProfile, 'fetchAIProfileByHandle').mockResolvedValue(null);
    vi.spyOn(sessionHistory, 'readBuyerSessionHistory').mockResolvedValue([]);
    vi.spyOn(sessionHistory, 'appendBuyerSessionMessage').mockResolvedValue();

    vi.spyOn(aiClient, 'streamGroqEvents').mockRejectedValue(
      new Error('AI Gateway stream error event from Groq'),
    );
    const groqSpy = vi.spyOn(aiClient, 'getGroqResponse').mockResolvedValue('odpowiedź');

    const env = { SHOP_DOMAIN: 'shop.myshopify.com' } as import('../src/config/bindings').Env;
    const req = new Request('https://example.com/chat', { method: 'POST' });
    const reply = await composeBuyerAssistantReply(env, 'epir-online-store', 'pierścionek', req, {
      sessionId: 'sess-fallback-test',
    });

    expect(reply).toBe('odpowiedź');
    expect(groqSpy).toHaveBeenCalledTimes(1);
    const messages = groqSpy.mock.calls[0]?.[0] as aiClient.GroqMessage[];
    const system = messages.find((m) => m.role === 'system');
    const systemContent = typeof system?.content === 'string' ? system.content : '';
    expect(systemContent).toContain('search_catalog');
    expect(groqSpy.mock.calls[0]?.length).toBeLessThanOrEqual(3);
  });

  it('(g) session history in messages and append after turn', async () => {
    vi.spyOn(toolReadiness, 'listAvailableBuyerTools').mockResolvedValue([]);
    vi.spyOn(aiProfile, 'fetchAIProfileByHandle').mockResolvedValue(null);
    vi.spyOn(sessionHistory, 'readBuyerSessionHistory').mockResolvedValue([
      { role: 'user', content: 'wcześniej' },
      { role: 'assistant', content: 'tak' },
    ]);
    const appendSpy = vi.spyOn(sessionHistory, 'appendBuyerSessionMessage').mockResolvedValue();

    vi.spyOn(aiClient, 'getGroqResponse').mockResolvedValue('nowa');

    const env = { SHOP_DOMAIN: 'shop.myshopify.com' } as import('../src/config/bindings').Env;
    const req = new Request('https://example.com/chat', { method: 'POST' });
    await composeBuyerAssistantReply(env, 'kazka-hydrogen', 'pytanie', req, {
      sessionId: 'sess-hist',
    });

    const messages = (vi.mocked(aiClient.getGroqResponse).mock.calls[0]?.[0] ??
      []) as aiClient.GroqMessage[];
    expect(messages.some((m) => m.role === 'user' && m.content === 'wcześniej')).toBe(true);
    expect(appendSpy).toHaveBeenCalledTimes(2);
  });

  it('append failure still returns assistant reply', async () => {
    vi.spyOn(toolReadiness, 'listAvailableBuyerTools').mockResolvedValue([]);
    vi.spyOn(aiProfile, 'fetchAIProfileByHandle').mockResolvedValue(null);
    vi.spyOn(sessionHistory, 'readBuyerSessionHistory').mockResolvedValue([]);
    vi.spyOn(sessionHistory, 'appendBuyerSessionMessage').mockRejectedValue(new Error('do down'));

    vi.spyOn(aiClient, 'getGroqResponse').mockResolvedValue('mimo błędu zapisu');

    const env = { SHOP_DOMAIN: 'shop.myshopify.com' } as import('../src/config/bindings').Env;
    const req = new Request('https://example.com/chat', { method: 'POST' });
    const reply = await composeBuyerAssistantReply(env, 'epir-online-store', 'hej', req, {
      sessionId: 'sess-append-fail',
    });
    expect(reply).toBe('mimo błędu zapisu');
  });

  it('without sessionId does not read session history', async () => {
    vi.spyOn(toolReadiness, 'listAvailableBuyerTools').mockResolvedValue([]);
    vi.spyOn(aiProfile, 'fetchAIProfileByHandle').mockResolvedValue(null);
    const readSpy = vi.spyOn(sessionHistory, 'readBuyerSessionHistory');
    vi.spyOn(aiClient, 'getGroqResponse').mockResolvedValue('ok');

    const env = { SHOP_DOMAIN: 'shop.myshopify.com' } as import('../src/config/bindings').Env;
    const req = new Request('https://example.com/chat', { method: 'POST' });
    await composeBuyerAssistantReply(env, 'epir-online-store', 'hej', req);
    expect(readSpy).not.toHaveBeenCalled();
  });

  it('(b) productHandle injects PRODUKT NA STRONIE with metal and weight', async () => {
    vi.spyOn(toolReadiness, 'listAvailableBuyerTools').mockResolvedValue([]);
    vi.spyOn(aiProfile, 'fetchAIProfileByHandle').mockResolvedValue(null);
    vi.spyOn(sessionHistory, 'readBuyerSessionHistory').mockResolvedValue([]);
    vi.spyOn(facts, 'fetchProductFactsByHandle').mockResolvedValue({
      channel: 'epir-zareczyny',
      productId: 'gid://shopify/Product/1',
      handle: 'test-ring',
      title: 'Pierścionek',
      vendor: '',
      productType: 'Ring',
      url: 'https://shop/p',
      image: null,
      collections: [],
      descriptionText: '',
      options: [],
      variants: [
        {
          variantId: SAMPLE_VARIANT_GID,
          title: '14',
          image: null,
          sku: null,
          weight: 3,
          weightUnit: 'GRAMS',
          price: { minor: 10000, currency: 'PLN', display_pl: '100 zł' },
          compareAtPrice: null,
          available: true,
          selectedOptions: [],
          metal: 'złoto',
          size: '14',
          stoneOrigin: 'natural',
          originEvidence: [],
        },
      ],
      priceRange: {
        min: { minor: 10000, currency: 'PLN', display_pl: '100 zł' },
        max: { minor: 10000, currency: 'PLN', display_pl: '100 zł' },
        isFlat: true,
      },
      stones: ['diament'],
      metals: ['złoto'],
      sizes: ['14'],
      metafields: {},
      productOriginRaw: null,
      dataIssues: [],
      fetchedAt: new Date().toISOString(),
    });

    let systemContent = '';
    vi.spyOn(aiClient, 'getGroqResponse').mockImplementation(async (messages) => {
      const system = messages.find((m) => m.role === 'system');
      systemContent = typeof system?.content === 'string' ? system.content : '';
      return 'ok';
    });

    const env = { SHOP_DOMAIN: 'shop.myshopify.com' } as import('../src/config/bindings').Env;
    const req = new Request('https://example.com/chat', { method: 'POST' });
    await composeBuyerAssistantReply(env, 'epir-zareczyny', 'jaka cena', req, {
      productHandle: 'test-ring',
    });

    expect(systemContent).toContain('[PRODUKT NA STRONIE]');
    expect(systemContent).toContain('metal: złoto');
    expect(systemContent).toMatch(/waga:\s*3 g/);
  });

  it('buyer_tool_loop_final stream error → getGroqResponse fallback with round final', async () => {
    vi.spyOn(toolReadiness, 'listAvailableBuyerTools').mockResolvedValue([
      'get_size_table',
      'search_shop_policies_and_faqs',
    ]);
    vi.spyOn(aiProfile, 'fetchAIProfileByHandle').mockResolvedValue(null);
    vi.spyOn(sessionHistory, 'readBuyerSessionHistory').mockResolvedValue([]);
    vi.spyOn(sessionHistory, 'appendBuyerSessionMessage').mockResolvedValue();
    vi.spyOn(executeBuyerToolMod, 'executeBuyerTool').mockResolvedValue({
      content: '{"ok":true}',
    });

    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    vi.spyOn(aiClient, 'streamGroqEvents').mockImplementation(
      async (_messages, _env, _tools, _sessionId, timingLabel) => {
        if (timingLabel === 'buyer_tool_loop_final') {
          throw new Error('AI Gateway stream error event from Groq');
        }
        const round = String(timingLabel ?? '').replace('buyer_tool_loop_', '');
        return toolCallOnlyStream('get_size_table', `call-${round}`);
      },
    );
    const groqSpy = vi
      .spyOn(aiClient, 'getGroqResponse')
      .mockResolvedValue('final fallback reply');

    const env = { SHOP_DOMAIN: 'shop.myshopify.com' } as import('../src/config/bindings').Env;
    const req = new Request('https://example.com/chat', { method: 'POST' });
    const reply = await composeBuyerAssistantReply(env, 'epir-online-store', 'rozmiar', req, {
      sessionId: 'sess-final-fallback',
    });

    expect(reply).toBe('final fallback reply');
    expect(groqSpy).toHaveBeenCalledTimes(1);
    expect(groqSpy.mock.calls[0]?.[2]).toMatchObject({
      timingLabel: 'buyer_tool_loop_final_fallback',
      sessionId: 'sess-final-fallback',
    });
    expect(warnSpy).toHaveBeenCalledWith(
      JSON.stringify({ tag: 'buyer.tool_loop_fallback', round: 'final' }),
    );
  });
});
