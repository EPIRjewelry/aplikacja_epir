import {beforeEach, describe, expect, it, vi} from 'vitest';
import {executeBuyerTool} from '../src/buyer/execute-buyer-tool';
import {KB_POLICY_UNAVAILABLE_REPLY} from '../src/buyer/kb-policies';
import type {BuyerChannelId} from '../src/buyer/channel-switch';
import {detectIllegalOrHarmfulRequest} from '../src/intent/jailbreak-prefilter';
import * as facts from '../src/facts';
import * as kbPolicies from '../src/buyer/kb-policies';
import * as mcp from '../src/mcp_server';
import {
  bandVariantsForPair,
  earringProduct,
  mergeIndex,
  mockCartContinue,
  mockFlatCartPayload,
  ringForChannel,
} from './helpers/buyer-golden';

const CHANNELS: BuyerChannelId[] = ['epir-online-store', 'epir-zareczyny'];
const ENV = {SHOP_DOMAIN: 'mock-shop.myshopify.com'} as import('../src/config/bindings').Env;
const READY = ['ucp_cart', 'search_catalog', 'search_shop_policies_and_faqs'] as const;

function cartTool(
  channelId: BuyerChannelId,
  name: string,
  args: Record<string, unknown>,
  extra: Partial<import('../src/buyer/execute-buyer-tool').ExecuteBuyerToolInput> = {},
) {
  const ring = ringForChannel(channelId);
  const index = mergeIndex(ring);
  const allowed = new Set(ring.variants.map((v) => v.variantId));
  return executeBuyerTool({
    env: ENV,
    channelId,
    readyTools: [...READY],
    name,
    argsJson: JSON.stringify(args),
    sessionCartId: extra.sessionCartId ?? null,
    sessionId: extra.sessionId ?? 'golden-sess',
    allowedVariantIds: extra.allowedVariantIds ?? allowed,
    variantOptionIndex: extra.variantOptionIndex ?? index,
    ...extra,
  });
}

describe('buyer golden — etap 1', () => {
  beforeEach(() => vi.restoreAllMocks());

  it.todo('T10 komplet / metafield rekomendacji — brak w field-mapping.ts');
  it.todo('T14 rabaty Shopify — brak parsera discount w workers/chat');
  it.todo('T16 Omnibus / compareAt — brak w format-product-block');
  it.todo(
    'T19 próg darmowej dostawy 500 zł całe zamówienie — brak logiki w workers/chat (tylko KB/LLM)',
  );
  it.todo('T27 jailbreak w handleBuyerTurn — PR1 fix/gemma-pr1-odmowa-fallback');

  it.fails('T28 S12 przemycić — detectIllegalOrHarmfulRequest po PR1', () => {
    expect(
      detectIllegalOrHarmfulRequest('Jak przemycić pierścionek przez lotnisko?'),
    ).toBe(true);
  });

  describe.each(CHANNELS)('channel %s', (channelId) => {
    it('T04 rozmiar 21 — brak mutacji koszyka', async () => {
      const ring = ringForChannel(channelId);
      const index = mergeIndex(ring);
      const v18 = ring.variants.find((v) => v.size === '18')!.variantId;
      const mcpSpy = vi.spyOn(mcp, 'callMcpToolDirect').mockImplementation(async (_e, name) => {
        if (name === 'get_cart') {
          return {
            result: {
              id: 'gid://shopify/Cart/MOCK',
              line_items: [{id: 'li1', quantity: 1, item: {id: v18}}],
            },
          };
        }
        return {result: {}};
      });
      const out = await cartTool(
        channelId,
        'update_cart',
        {
          add_items: [
            {
              quantity: 1,
              product_variant_id: v18,
              selected_options: [{name: 'Rozmiar', value: '21'}],
            },
          ],
        },
        {sessionCartId: 'gid://shopify/Cart/MOCK', variantOptionIndex: index},
      );
      const parsed = JSON.parse(out.content) as {status?: string};
      expect(parsed.status).toBe('option_value_out_of_range');
      expect(mcpSpy.mock.calls.filter((c) => c[1] === 'update_cart')).toHaveLength(0);
    });

    it('T05 create_cart z opcjami — continue_url z mocka', async () => {
      const ring = ringForChannel(channelId);
      const cont = mockCartContinue(channelId);
      vi.spyOn(mcp, 'callMcpToolDirect').mockResolvedValue({
        result: mockFlatCartPayload(
          channelId,
          [{id: 'li1', quantity: 1, item: {id: ring.variants[1].variantId}}],
          [{type: 'total', amount: 10000}],
        ),
      });
      const out = await cartTool(channelId, 'create_cart', {
        line_items: [
          {
            quantity: 1,
            item: {id: ring.variants[1].variantId},
            selected_options: [{name: 'Rozmiar', value: '17'}],
          },
        ],
      });
      expect(out.cartMutationSucceeded).toBe(true);
      expect(out.continueUrl).toBe(cont);
    });

    it('T06 create_cart bez rozmiaru — needs_option, 0 MCP', async () => {
      const ring = ringForChannel(channelId);
      const mcpSpy = vi.spyOn(mcp, 'callMcpToolDirect');
      const out = await cartTool(channelId, 'create_cart', {
        line_items: [{quantity: 1, item: {id: ring.variants[0].variantId}}],
      });
      expect(mcpSpy).not.toHaveBeenCalled();
      expect(JSON.parse(out.content).status).toBe('needs_option');
    });

    it('T07 zamiana rozmiaru 18→17 — jedna linia', async () => {
      const ring = ringForChannel(channelId);
      const v18 = ring.variants.find((v) => v.size === '18')!.variantId;
      const v17 = ring.variants.find((v) => v.size === '17')!.variantId;
      const spy = vi.spyOn(mcp, 'callMcpToolDirect').mockImplementation(async (_e, name) => {
        if (name === 'get_cart') {
          return {
            result: {
              id: 'gid://shopify/Cart/MOCK',
              line_items: [{id: 'li-ring', quantity: 1, item: {id: v18}}],
            },
          };
        }
        return {
          result: mockFlatCartPayload(
            channelId,
            [{id: 'li-ring', quantity: 1, item: {id: v17}}],
            [{type: 'total', amount: 10000}],
          ),
        };
      });
      const out = await cartTool(
        channelId,
        'update_cart',
        {
          add_items: [
            {
              quantity: 1,
              product_variant_id: v17,
              selected_options: [{name: 'Rozmiar', value: '17'}],
            },
          ],
          remove_line_ids: ['li-ring'],
        },
        {sessionCartId: 'gid://shopify/Cart/MOCK'},
      );
      expect(spy.mock.calls.map((c) => c[1])).toEqual(['get_cart', 'update_cart']);
      expect(out.cartMutationSucceeded).toBe(true);
      const updateArgs = spy.mock.calls[1]![2] as {cart?: {line_items?: unknown[]}};
      const lines = updateArgs.cart?.line_items as {item: {id: string}}[];
      expect(lines).toHaveLength(1);
      expect(lines[0].item.id).toBe(v17);
    });

    it('T08 swap na niedostępny wariant — variant_not_for_sale', async () => {
      const ring = ringForChannel(channelId);
      const v18 = ring.variants.find((v) => v.size === '18')!.variantId;
      const unav = ring.variants.find((v) => v.variantId.includes('UNAV'))!.variantId;
      const mcpSpy = vi.spyOn(mcp, 'callMcpToolDirect').mockImplementation(async (_e, name) => {
        if (name === 'get_cart') {
          return {
            result: {
              id: 'gid://shopify/Cart/MOCK',
              line_items: [{id: 'li1', quantity: 1, item: {id: v18}}],
            },
          };
        }
        return {result: {}};
      });
      const out = await cartTool(
        channelId,
        'update_cart',
        {
          add_items: [
            {
              quantity: 1,
              product_variant_id: unav,
              selected_options: [{name: 'Rozmiar', value: '14'}],
            },
          ],
        },
        {sessionCartId: 'gid://shopify/Cart/MOCK'},
      );
      expect(JSON.parse(out.content).status).toBe('variant_not_for_sale');
      expect(out.cartMutationSucceeded).toBeUndefined();
      expect(mcpSpy.mock.calls.filter((c) => c[1] === 'update_cart')).toHaveLength(0);
    });

    it('T08 warning messages → cartNotices', async () => {
      const ring = ringForChannel(channelId);
      const vid = ring.variants[1].variantId;
      const warn = 'Mock: wariant prawie niedostępny (fikcyjny).';
      vi.spyOn(mcp, 'callMcpToolDirect').mockResolvedValue({
        result: mockFlatCartPayload(
          channelId,
          [{id: 'li1', quantity: 1, item: {id: vid}}],
          [{type: 'total', amount: 10000}],
          [{type: 'warning', content: warn, code: 'mock_warn'}],
        ),
      });
      const out = await cartTool(channelId, 'create_cart', {
        line_items: [
          {
            quantity: 1,
            item: {id: vid},
            selected_options: [{name: 'Rozmiar', value: '17'}],
          },
        ],
      });
      expect(out.cartMutationSucceeded).toBe(true);
      expect(out.cartNotices?.join(' ')).toContain(warn);
    });

    it.fails('T08 create_cart niedostępny wariant z pełnymi opcjami — brak bramki add', async () => {
      const ring = ringForChannel(channelId);
      const unav = ring.variants.find((v) => !v.available)!.variantId;
      const mcpSpy = vi.spyOn(mcp, 'callMcpToolDirect').mockResolvedValue({
        result: mockFlatCartPayload(channelId, [], [{type: 'total', amount: 0}]),
      });
      const out = await cartTool(channelId, 'create_cart', {
        line_items: [
          {
            quantity: 1,
            item: {id: unav},
            selected_options: [{name: 'Rozmiar', value: '14'}],
          },
        ],
      });
      expect(mcpSpy).not.toHaveBeenCalled();
      expect(out.cartMutationSucceeded).not.toBe(true);
    });

    it('T09 usuń kolczyki — zostaje pierścionek', async () => {
      const ring = ringForChannel(channelId);
      const ear = earringProduct(channelId);
      const index = mergeIndex(ring, ear);
      const ringVid = ring.variants[0].variantId;
      const earVid = ear.variants[0].variantId;
      const spy = vi.spyOn(mcp, 'callMcpToolDirect').mockImplementation(async (_e, name) => {
        if (name === 'get_cart') {
          return {
            result: {
              id: 'gid://shopify/Cart/MOCK',
              line_items: [
                {id: 'li-ring', quantity: 1, item: {id: ringVid}},
                {id: 'li-ear', quantity: 1, item: {id: earVid}},
              ],
            },
          };
        }
        return {
          result: mockFlatCartPayload(
            channelId,
            [{id: 'li-ring', quantity: 1, item: {id: ringVid}}],
            [{type: 'total', amount: 18000}],
          ),
        };
      });
      await cartTool(
        channelId,
        'update_cart',
        {remove_line_ids: ['li-ear']},
        {
          sessionCartId: 'gid://shopify/Cart/MOCK',
          variantOptionIndex: index,
          allowedVariantIds: new Set([ringVid, earVid]),
        },
      );
      const updateArgs = spy.mock.calls.find((c) => c[1] === 'update_cart')![2] as {
        cart?: {line_items?: {item: {id: string}}[]};
      };
      expect(updateArgs.cart?.line_items).toHaveLength(1);
      expect(updateArgs.cart?.line_items![0].item.id).toBe(ringVid);
    });

    it('T11 dwie obrączki — 2 linie w mutacji', async () => {
      const band = bandVariantsForPair(channelId);
      const index = mergeIndex(band);
      const v12 = band.variants[0].variantId;
      const v22 = band.variants[1].variantId;
      const spy = vi.spyOn(mcp, 'callMcpToolDirect').mockResolvedValue({
        result: mockFlatCartPayload(
          channelId,
          [
            {id: 'l1', quantity: 1, item: {id: v12}},
            {id: 'l2', quantity: 1, item: {id: v22}},
          ],
          [{type: 'total', amount: 20000}],
        ),
      });
      await cartTool(
        channelId,
        'create_cart',
        {
          line_items: [
            {
              quantity: 1,
              item: {id: v12},
              selected_options: [{name: 'Rozmiar', value: '12'}],
            },
            {
              quantity: 1,
              item: {id: v22},
              selected_options: [{name: 'Rozmiar', value: '22'}],
            },
          ],
        },
        {variantOptionIndex: index, allowedVariantIds: new Set([v12, v22])},
      );
      const createArgs = spy.mock.calls[0]![2] as {line_items?: unknown[]};
      expect(createArgs.line_items).toHaveLength(2);
    });

    it('T17 cartTotalsNote — suma 420 zł z mocka UCP (execute-buyer-tool)', async () => {
      const ring = ringForChannel(channelId);
      vi.spyOn(mcp, 'callMcpToolDirect').mockResolvedValue({
        result: mockFlatCartPayload(
          channelId,
          [{id: 'li1', quantity: 1, item: {id: ring.variants[0].variantId}}],
          [{type: 'total', amount: 42000, currency: 'PLN'}],
        ),
      });
      const out = await cartTool(channelId, 'create_cart', {
        line_items: [
          {
            quantity: 1,
            item: {id: ring.variants[0].variantId},
            selected_options: [{name: 'Rozmiar', value: '9'}],
          },
        ],
      });
      expect(out.cartMutationSucceeded).toBe(true);
      expect(out.cartTotalsNote).toMatch(/420/);
      expect(out.cartTotalsNote).toMatch(/Suma szacunkowa/);
    });

    it('T23 KB błąd — KB_POLICY_UNAVAILABLE_REPLY', async () => {
      vi.spyOn(kbPolicies, 'searchShopPoliciesViaMcp').mockResolvedValue({
        ok: false,
        reason: 'mcp_error',
      });
      const fail = await cartTool(channelId, 'search_shop_policies_and_faqs', {query: 'telefon'});
      expect(fail.content).toBe(KB_POLICY_UNAVAILABLE_REPLY);
    });

    it('T30 KB błąd + pusty katalog — bez faktów spoza narzędzi', async () => {
      vi.spyOn(kbPolicies, 'searchShopPoliciesViaMcp').mockResolvedValue({
        ok: false,
        reason: 'mcp_error',
      });
      const kb = await cartTool(channelId, 'search_shop_policies_and_faqs', {query: 'x'});
      expect(kb.content).toBe(KB_POLICY_UNAVAILABLE_REPLY);
      vi.spyOn(facts, 'getCatalogRepository').mockResolvedValue({
        search: vi.fn().mockResolvedValue({
          matches: [],
          total: 0,
          facets: {
            total: 0,
            byOrigin: {natural: 0, lab_grown: 0, cultured: 0, mixed: 0, unknown: 0},
            byStone: {},
            byMetal: {},
            byProductType: {},
          },
        }),
      } as never);
      const cat = await cartTool(channelId, 'search_catalog', {query: 'pierścionek mock'});
      const body = JSON.parse(cat.content) as {products?: string; technical?: string};
      expect(body.products ?? '').not.toMatch(/gid:\/\/shopify/);
      expect(body.technical ?? '').toBe('');
    });
  });
});
