import { beforeEach, describe, expect, it, vi } from 'vitest';

import {
  executeBuyerTool,
  stripModelCartIds,
} from '../src/buyer/execute-buyer-tool';
import * as mcp from '../src/mcp_server';
import * as sessionCart from '../src/buyer/session-cart';
import * as sizeTable from '../src/size-table';
import { KB_POLICY_UNAVAILABLE_REPLY } from '../src/buyer/kb-policies';

describe('executeBuyerTool', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it('denies tools not in readiness without network', async () => {
    const spy = vi.spyOn(mcp, 'callMcpToolDirect');
    const r = await executeBuyerTool({
      env: {} as import('../src/config/bindings').Env,
      channelId: 'epir-online-store',
      readyTools: ['get_size_table'],
      name: 'create_cart',
      argsJson: '{}',
      sessionCartId: null,
      allowedVariantIds: new Set(),
    });
    expect(JSON.parse(r.content).reason).toBe('not_in_readiness');
    expect(spy).not.toHaveBeenCalled();
  });

  it('(a) strips model cart id different from session and uses sessionCartId', async () => {
    const spy = vi.spyOn(mcp, 'callMcpToolDirect').mockResolvedValue({
      result: {
        continue_url: 'https://shop/cart',
        cart_id: 'gid://shopify/Cart/SESSION',
        line_items: [],
      },
    });

    await executeBuyerTool({
      env: { SHOP_DOMAIN: 'shop.myshopify.com' } as import('../src/config/bindings').Env,
      channelId: 'epir-online-store',
      readyTools: ['ucp_cart'],
      name: 'get_cart',
      argsJson: JSON.stringify({ id: 'gid://shopify/Cart/FROM_MODEL', cart_id: 'gid://shopify/Cart/FROM_MODEL' }),
      sessionId: 'sess-1',
      sessionCartId: 'gid://shopify/Cart/SESSION',
      allowedVariantIds: new Set(),
    });

    expect(spy).toHaveBeenCalledOnce();
    const [, name, args, opts] = spy.mock.calls[0]!;
    expect(name).toBe('get_cart');
    expect(args).not.toHaveProperty('id');
    expect(args).not.toHaveProperty('cart_id');
    expect((opts as { sessionCartId?: string }).sessionCartId).toBe('gid://shopify/Cart/SESSION');
  });

  it('rejects get_cart without sessionCartId as no_session_cart', async () => {
    const spy = vi.spyOn(mcp, 'callMcpToolDirect');
    const r = await executeBuyerTool({
      env: {} as import('../src/config/bindings').Env,
      channelId: 'epir-online-store',
      readyTools: ['ucp_cart'],
      name: 'get_cart',
      argsJson: '{}',
      sessionCartId: null,
      allowedVariantIds: new Set(),
    });
    expect(JSON.parse(r.content).reason).toBe('no_session_cart');
    expect(spy).not.toHaveBeenCalled();
  });

  it('rejects update_cart with model line_items', async () => {
    const spy = vi.spyOn(mcp, 'callMcpToolDirect');
    const r = await executeBuyerTool({
      env: {} as import('../src/config/bindings').Env,
      channelId: 'epir-online-store',
      readyTools: ['ucp_cart'],
      name: 'update_cart',
      argsJson: JSON.stringify({
        line_items: [{ quantity: 1, item: { id: 'gid://shopify/ProductVariant/1' } }],
      }),
      sessionCartId: 'gid://shopify/Cart/SESSION',
      allowedVariantIds: new Set(['gid://shopify/ProductVariant/1']),
    });
    expect(JSON.parse(r.content).reason).toBe('full_cart_replace_forbidden');
    expect(spy).not.toHaveBeenCalled();
  });

  it('passes update_cart patch to callMcpToolDirect without manual get_cart', async () => {
    const spy = vi.spyOn(mcp, 'callMcpToolDirect').mockResolvedValue({
      result: { continue_url: 'https://x', line_items: [{}, {}] },
    });
    await executeBuyerTool({
      env: { SHOP_DOMAIN: 'shop.myshopify.com' } as import('../src/config/bindings').Env,
      channelId: 'epir-online-store',
      readyTools: ['ucp_cart'],
      name: 'update_cart',
      argsJson: JSON.stringify({
        update_items: [{ id: 'line-1', quantity: 2 }],
      }),
      sessionCartId: 'gid://shopify/Cart/SESSION',
      allowedVariantIds: new Set(),
    });
    expect(spy).toHaveBeenCalledOnce();
    expect(spy.mock.calls[0]![1]).toBe('update_cart');
    expect(spy.mock.calls[0]![2]).toEqual({ update_items: [{ id: 'line-1', quantity: 2 }] });
  });

  it('(c) writes set-cart-id only after successful create_cart with UCP id', async () => {
    const writeSpy = vi.spyOn(sessionCart, 'writeSessionCartId').mockResolvedValue();
    vi.spyOn(mcp, 'callMcpToolDirect').mockResolvedValue({
      result: {
        structuredContent: {
          cart: {
            id: 'gid://shopify/Cart/FROM_UCP',
            continue_url: 'https://shop/cart',
            line_items: [],
          },
        },
      },
    });

    const variant = 'gid://shopify/ProductVariant/99';
    const r = await executeBuyerTool({
      env: { SHOP_DOMAIN: 'shop.myshopify.com' } as import('../src/config/bindings').Env,
      channelId: 'epir-online-store',
      readyTools: ['ucp_cart'],
      name: 'create_cart',
      argsJson: JSON.stringify({
        line_items: [{ quantity: 1, item: { id: variant } }],
      }),
      sessionId: 'sess-write',
      sessionCartId: null,
      allowedVariantIds: new Set([variant]),
    });

    expect(writeSpy).toHaveBeenCalledWith(
      expect.anything(),
      'sess-write',
      'gid://shopify/Cart/FROM_UCP',
    );
    expect(r.sessionCartId).toBe('gid://shopify/Cart/FROM_UCP');
  });

  it('does not write session cart when create_cart fails', async () => {
    const writeSpy = vi.spyOn(sessionCart, 'writeSessionCartId').mockResolvedValue();
    vi.spyOn(mcp, 'callMcpToolDirect').mockResolvedValue({
      error: { code: -32000, message: 'fail' },
    });
    const variant = 'gid://shopify/ProductVariant/99';
    await executeBuyerTool({
      env: {} as import('../src/config/bindings').Env,
      channelId: 'epir-online-store',
      readyTools: ['ucp_cart'],
      name: 'create_cart',
      argsJson: JSON.stringify({
        line_items: [{ quantity: 1, item: { id: variant } }],
      }),
      sessionId: 'sess-fail',
      sessionCartId: null,
      allowedVariantIds: new Set([variant]),
    });
    expect(writeSpy).not.toHaveBeenCalled();
  });

  it('denies variant_not_in_channel for merchandise_id outside allowlist', async () => {
    const spy = vi.spyOn(mcp, 'callMcpToolDirect');
    const foreign = 'gid://shopify/ProductVariant/MERCH';
    const r = await executeBuyerTool({
      env: {} as import('../src/config/bindings').Env,
      channelId: 'kazka-hydrogen',
      readyTools: ['ucp_cart'],
      name: 'create_cart',
      argsJson: JSON.stringify({
        line_items: [{ quantity: 1, merchandise_id: foreign }],
      }),
      sessionId: 'sess-k',
      sessionCartId: null,
      allowedVariantIds: new Set(['gid://shopify/ProductVariant/KAZKA']),
    });
    expect(JSON.parse(r.content).reason).toBe('variant_not_in_channel');
    expect(spy).not.toHaveBeenCalled();
  });

  it('denies variant_not_in_channel for variant_id outside allowlist', async () => {
    const spy = vi.spyOn(mcp, 'callMcpToolDirect');
    const foreign = 'gid://shopify/ProductVariant/FOREIGN';
    const r = await executeBuyerTool({
      env: {} as import('../src/config/bindings').Env,
      channelId: 'kazka-hydrogen',
      readyTools: ['ucp_cart'],
      name: 'update_cart',
      argsJson: JSON.stringify({
        add_items: [{ quantity: 1, variant_id: foreign }],
      }),
      sessionId: 'sess-k',
      sessionCartId: 'gid://shopify/Cart/SESSION',
      allowedVariantIds: new Set(['gid://shopify/ProductVariant/KAZKA']),
    });
    expect(JSON.parse(r.content).reason).toBe('variant_not_in_channel');
    expect(spy).not.toHaveBeenCalled();
  });

  it('denies variant_unreadable when line item has no variant id', async () => {
    const spy = vi.spyOn(mcp, 'callMcpToolDirect');
    const r = await executeBuyerTool({
      env: {} as import('../src/config/bindings').Env,
      channelId: 'epir-online-store',
      readyTools: ['ucp_cart'],
      name: 'create_cart',
      argsJson: JSON.stringify({
        line_items: [{ quantity: 1 }],
      }),
      sessionId: 'sess-1',
      sessionCartId: null,
      allowedVariantIds: new Set(['gid://shopify/ProductVariant/1']),
    });
    expect(JSON.parse(r.content).reason).toBe('variant_unreadable');
    expect(spy).not.toHaveBeenCalled();
  });

  it('denies variant_not_in_channel for foreign variant', async () => {
    const spy = vi.spyOn(mcp, 'callMcpToolDirect');
    const r = await executeBuyerTool({
      env: {} as import('../src/config/bindings').Env,
      channelId: 'kazka-hydrogen',
      readyTools: ['ucp_cart'],
      name: 'create_cart',
      argsJson: JSON.stringify({
        line_items: [{ quantity: 1, item: { id: 'gid://shopify/ProductVariant/EPIR' } }],
      }),
      sessionId: 'sess-k',
      sessionCartId: null,
      allowedVariantIds: new Set(['gid://shopify/ProductVariant/KAZKA']),
    });
    expect(JSON.parse(r.content).reason).toBe('variant_not_in_channel');
    expect(spy).not.toHaveBeenCalled();
  });

  it('returns KB unavailable on policy mcp error', async () => {
    vi.spyOn(mcp, 'callMcpToolDirect').mockResolvedValue({ error: { message: 'x' } });
    const r = await executeBuyerTool({
      env: {} as import('../src/config/bindings').Env,
      channelId: 'epir-online-store',
      readyTools: ['search_shop_policies_and_faqs'],
      name: 'search_shop_policies_and_faqs',
      argsJson: JSON.stringify({ query: 'zwroty' }),
      sessionCartId: null,
      allowedVariantIds: new Set(),
    });
    expect(r.content).toBe(KB_POLICY_UNAVAILABLE_REPLY);
  });

  it('passes policy answer and sources; wire only query+context', async () => {
    const spy = vi.spyOn(mcp, 'callMcpToolDirect').mockResolvedValue({
      result: {
        structuredContent: {
          answer: 'Zwroty w 14 dni.',
          sources: [{ title: 'Regulamin', url: 'https://shop/polityka' }],
        },
      },
    });
    const r = await executeBuyerTool({
      env: {} as import('../src/config/bindings').Env,
      channelId: 'epir-online-store',
      readyTools: ['search_shop_policies_and_faqs'],
      name: 'search_shop_policies_and_faqs',
      argsJson: JSON.stringify({ query: 'zwroty', context: 'checkout', locale: 'ignored' }),
      sessionCartId: null,
      allowedVariantIds: new Set(),
    });
    expect(spy.mock.calls[0]![2]).toEqual({ query: 'zwroty', context: 'checkout' });
    const body = JSON.parse(r.content);
    expect(body.answer).toBe('Zwroty w 14 dni.');
    expect(body.sources[0].url).toBe('https://shop/polityka');
  });

  it('passes size table fallback unchanged; brand from channel', async () => {
    const spy = vi.spyOn(sizeTable, 'getSizeTable').mockResolvedValue({
      content: 'Tabela niedostępna — nie zgaduj.',
      source: 'fallback',
    });
    const r = await executeBuyerTool({
      env: {} as import('../src/config/bindings').Env,
      channelId: 'epir-zareczyny',
      readyTools: ['get_size_table'],
      name: 'get_size_table',
      argsJson: '{}',
      sessionCartId: null,
      allowedVariantIds: new Set(),
    });
    expect(spy).toHaveBeenCalledWith(expect.anything(), 'zareczyny');
    expect(r.content).toBe('Tabela niedostępna — nie zgaduj.');
  });

  it('non-429 MCP error exposes only code and CART_UNAVAILABLE notice', async () => {
    vi.spyOn(mcp, 'callMcpToolDirect').mockResolvedValue({
      error: { code: 500, message: 'internal', details: 'sekret' },
    });
    const r = await executeBuyerTool({
      env: {} as import('../src/config/bindings').Env,
      channelId: 'epir-online-store',
      readyTools: ['ucp_cart'],
      name: 'get_cart',
      argsJson: '{}',
      sessionCartId: 'gid://shopify/Cart/SESSION',
      allowedVariantIds: new Set(),
    });
    const body = JSON.parse(r.content);
    expect(body.error).toEqual({ code: 500 });
    expect(body.notice).toContain('niedostępny');
    expect(r.content).not.toContain('sekret');
    expect(r.content).not.toContain('internal');
  });

  it('cancel_cart clears SessionDO cart id on success', async () => {
    const writeSpy = vi.spyOn(sessionCart, 'writeSessionCartId').mockResolvedValue();
    vi.spyOn(mcp, 'callMcpToolDirect').mockResolvedValue({
      result: { cancelled: true },
    });
    const r = await executeBuyerTool({
      env: { SESSION_DO: {} } as import('../src/config/bindings').Env,
      channelId: 'epir-online-store',
      readyTools: ['ucp_cart'],
      name: 'cancel_cart',
      argsJson: '{}',
      sessionId: 'sess-cancel',
      sessionCartId: 'gid://shopify/Cart/SESSION',
      allowedVariantIds: new Set(),
    });
    expect(writeSpy).toHaveBeenCalledWith(expect.anything(), 'sess-cancel', '');
    expect(r.sessionCartId).toBeNull();
  });

  it('429 does not retry; returns unavailable copy', async () => {
    const spy = vi.spyOn(mcp, 'callMcpToolDirect').mockResolvedValue({
      error: { code: 429, message: 'rate', details: 'retry_after=12' },
    });
    const r = await executeBuyerTool({
      env: {} as import('../src/config/bindings').Env,
      channelId: 'epir-online-store',
      readyTools: ['ucp_cart'],
      name: 'get_cart',
      argsJson: '{}',
      sessionCartId: 'gid://shopify/Cart/SESSION',
      allowedVariantIds: new Set(),
    });
    expect(spy).toHaveBeenCalledOnce();
    expect(r.content.toLowerCase()).toContain('niedostępny');
  });

  it('stripModelCartIds removes id and cart_id', () => {
    expect(
      stripModelCartIds({ id: 'x', cart_id: 'y', update_items: [] }),
    ).toEqual({ update_items: [] });
  });

  it('denies update_cart with model lines alias as empty_after_filter without MCP', async () => {
    const spy = vi.spyOn(mcp, 'callMcpToolDirect');
    const foreign = 'gid://shopify/ProductVariant/FOREIGN';
    const logSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
    const r = await executeBuyerTool({
      env: {} as import('../src/config/bindings').Env,
      channelId: 'epir-online-store',
      readyTools: ['ucp_cart'],
      name: 'update_cart',
      argsJson: JSON.stringify({
        lines: [{ merchandise_id: foreign, quantity: 1 }],
      }),
      sessionCartId: 'gid://shopify/Cart/SESSION',
      allowedVariantIds: new Set([foreign]),
    });
    expect(JSON.parse(r.content).reason).toBe('empty_after_filter');
    expect(spy).not.toHaveBeenCalled();
    expect(r.content).not.toContain(foreign);
    const dropped = logSpy.mock.calls
      .map((c) => {
        try {
          return JSON.parse(String(c[0])) as { tag?: string; keys?: string[] };
        } catch {
          return null;
        }
      })
      .find((o) => o?.tag === 'buyer.tool_args_dropped');
    expect(dropped?.keys).toContain('lines');
    logSpy.mockRestore();
  });

  it('denies create_cart with model lines alias as empty_after_filter without MCP', async () => {
    const spy = vi.spyOn(mcp, 'callMcpToolDirect');
    const foreign = 'gid://shopify/ProductVariant/FOREIGN';
    const r = await executeBuyerTool({
      env: {} as import('../src/config/bindings').Env,
      channelId: 'epir-online-store',
      readyTools: ['ucp_cart'],
      name: 'create_cart',
      argsJson: JSON.stringify({
        lines: [{ merchandise_id: foreign, quantity: 1 }],
      }),
      sessionCartId: null,
      allowedVariantIds: new Set([foreign]),
    });
    expect(JSON.parse(r.content).reason).toBe('empty_after_filter');
    expect(spy).not.toHaveBeenCalled();
    expect(r.content).not.toContain(foreign);
  });

  it('update_cart drops lines but keeps add_items; logs tool_args_dropped', async () => {
    const spy = vi.spyOn(mcp, 'callMcpToolDirect').mockResolvedValue({
      result: { continue_url: 'https://x', line_items: [] },
    });
    const logSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
    const allowed = 'gid://shopify/ProductVariant/ALLOWED';
    const foreign = 'gid://shopify/ProductVariant/FOREIGN';
    await executeBuyerTool({
      env: { SHOP_DOMAIN: 'shop.myshopify.com' } as import('../src/config/bindings').Env,
      channelId: 'epir-online-store',
      readyTools: ['ucp_cart'],
      name: 'update_cart',
      argsJson: JSON.stringify({
        lines: [{ merchandise_id: foreign, quantity: 1 }],
        add_items: [{ quantity: 1, variant_id: allowed }],
        context: 'ignored',
      }),
      sessionCartId: 'gid://shopify/Cart/SESSION',
      allowedVariantIds: new Set([allowed]),
    });
    expect(spy).toHaveBeenCalledOnce();
    const mcpArgs = spy.mock.calls[0]![2] as Record<string, unknown>;
    expect(mcpArgs).toEqual({
      add_items: [{ quantity: 1, variant_id: allowed }],
    });
    expect(mcpArgs).not.toHaveProperty('lines');
    expect(JSON.stringify(mcpArgs)).not.toContain(foreign);
    const dropped = logSpy.mock.calls
      .map((c) => {
        try {
          return JSON.parse(String(c[0])) as { tag?: string; keys?: string[] };
        } catch {
          return null;
        }
      })
      .find((o) => o?.tag === 'buyer.tool_args_dropped');
    expect(dropped?.keys).toEqual(expect.arrayContaining(['lines', 'context']));
    logSpy.mockRestore();
  });
});
