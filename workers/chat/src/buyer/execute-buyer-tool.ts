import type { Env } from '../config/bindings';
import { resolveCommerceContext } from '../config/commerce-context';
import { callMcpToolDirect } from '../mcp_server';
import { extractCartObject, lineItemsFromCartPayload, variantIdOf } from '../cart/ucp-cart';
import { getSizeTable } from '../size-table';
import type { BuyerChannelId } from './channel-switch';
import { buyerToolIdForName } from './buyer-tools';
import {
  KB_POLICY_UNAVAILABLE_REPLY,
  searchShopPoliciesViaMcp,
} from './kb-policies';
import { recordPolicyTouchIfIdentified } from './policy-audit';
import { writeSessionCartId } from './session-cart';
import { catalogSnapshotChannel } from './channel-switch';
import { validateSearchCatalogArgs } from './search-catalog-args';
import { brandKeyForChannel, type BuyerToolId } from './tool-readiness';
import { CATALOG_SEARCH_SERVER_LIMIT } from '../facts/catalog-ucp-args';
import { formatMatchBlock, CATALOG_SEARCH_HEADER } from '../facts/format-product-block';
import { getCatalogRepository } from '../facts';
import type { CatalogFilters } from '../facts/types';

const CART_UNAVAILABLE =
  'Koszyk jest chwilowo niedostępny. Spróbuj ponownie za chwilę lub skorzystaj z koszyka na stronie sklepu.';

export type ExecuteBuyerToolInput = {
  env: Env;
  channelId: BuyerChannelId;
  readyTools: BuyerToolId[];
  name: string;
  argsJson: string;
  sessionId?: string;
  sessionCartId: string | null;
  allowedVariantIds: Set<string>;
  shopifyCustomerId?: string | null;
  request?: Request;
};

export type ExecuteBuyerToolResult = {
  content: string;
  sessionCartId?: string | null;
  newVariantIds?: string[];
};

function deny(reason: string, extra?: Record<string, unknown>): ExecuteBuyerToolResult {
  console.log(
    JSON.stringify({
      tag: 'buyer.tool_denied',
      reason,
      ...extra,
    }),
  );
  return {
    content: JSON.stringify({
      error: 'tool_denied',
      reason,
      notice: 'Narzędzie niedostępne w tej turze — nie twierdź o wyniku z pamięci.',
    }),
  };
}

function parseArgs(argsJson: string): Record<string, unknown> {
  try {
    const parsed = JSON.parse(argsJson || '{}') as unknown;
    if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
      return { ...(parsed as Record<string, unknown>) };
    }
  } catch {
    /* ignore */
  }
  return {};
}

const CART_TOOL_ARG_WHITELIST: Record<string, readonly string[]> = {
  create_cart: ['line_items'],
  update_cart: ['add_items', 'update_items', 'remove_line_ids'],
  get_cart: [],
  cancel_cart: [],
};

/** Keep only MCP-accepted cart tool keys; log dropped model noise (key names only). */
export function filterCartToolArgs(
  toolName: string,
  args: Record<string, unknown>,
): Record<string, unknown> {
  const allowed = CART_TOOL_ARG_WHITELIST[toolName];
  if (allowed === undefined) {
    return args;
  }
  const allowedSet = new Set(allowed);
  const filtered: Record<string, unknown> = {};
  const dropped: string[] = [];
  for (const [key, value] of Object.entries(args)) {
    if (allowedSet.has(key)) {
      filtered[key] = value;
    } else {
      dropped.push(key);
    }
  }
  if (dropped.length > 0) {
    console.log(
      JSON.stringify({
        tag: 'buyer.tool_args_dropped',
        tool: toolName,
        keys: dropped,
      }),
    );
  }
  return filtered;
}

function cartArgsEmptyAfterFilter(toolName: string, args: Record<string, unknown>): boolean {
  if (toolName === 'create_cart') {
    return !Array.isArray(args.line_items) || args.line_items.length === 0;
  }
  if (toolName === 'update_cart') {
    return (
      !Array.isArray(args.add_items) &&
      !Array.isArray(args.update_items) &&
      !Array.isArray(args.remove_line_ids)
    );
  }
  return false;
}

/** Strip model-supplied cart identifiers — SessionDO is the only source. */
export function stripModelCartIds(args: Record<string, unknown>): Record<string, unknown> {
  const next = { ...args };
  delete next.id;
  delete next.cart_id;
  if (next.cart && typeof next.cart === 'object' && !Array.isArray(next.cart)) {
    const cart = { ...(next.cart as Record<string, unknown>) };
    delete cart.id;
    next.cart = cart;
  }
  return next;
}

type CollectVariantIdsResult =
  | { ok: true; ids: string[] }
  | { ok: false; reason: 'variant_unreadable' };

function collectVariantIdsFromArgs(args: Record<string, unknown>): CollectVariantIdsResult {
  const entries: unknown[] = [];

  if (Array.isArray(args.line_items)) entries.push(...args.line_items);
  if (args.cart && typeof args.cart === 'object' && !Array.isArray(args.cart)) {
    const cartLineItems = (args.cart as { line_items?: unknown }).line_items;
    if (Array.isArray(cartLineItems)) entries.push(...cartLineItems);
  }
  if (Array.isArray(args.add_items)) entries.push(...args.add_items);

  const ids: string[] = [];
  for (const entry of entries) {
    if (!entry || typeof entry !== 'object') continue;
    const vid = variantIdOf(entry as Record<string, unknown>);
    if (!vid) return { ok: false, reason: 'variant_unreadable' };
    ids.push(vid);
  }
  return { ok: true, ids };
}

function extractRetryAfterFromDetails(details: unknown): string | undefined {
  if (typeof details !== 'string' || !details.trim()) return undefined;
  const m = details.match(/retry[_-]?after["\s:=]+(\d+)/i);
  return m?.[1];
}

function cartIdFromMcpResult(result: unknown): string | null {
  const cart = extractCartObject(result);
  if (cart && typeof cart.id === 'string' && cart.id.trim()) return cart.id.trim();
  if (result && typeof result === 'object') {
    const presented = result as { cart_id?: unknown };
    if (typeof presented.cart_id === 'string' && presented.cart_id.trim()) {
      return presented.cart_id.trim();
    }
  }
  return null;
}

/** Variant ids already in the session cart (from server get_cart / payload). */
export function variantIdsFromCartPayload(payload: unknown): string[] {
  const lines = lineItemsFromCartPayload(payload);
  return lines.map((l) => l.item.id).filter(Boolean);
}

export async function executeBuyerTool(
  input: ExecuteBuyerToolInput,
): Promise<ExecuteBuyerToolResult> {
  const toolId = buyerToolIdForName(input.name);
  if (!toolId || !input.readyTools.includes(toolId)) {
    return deny('not_in_readiness', { tool: input.name });
  }

  const brand = brandKeyForChannel(input.channelId);
  const commerceContext = resolveCommerceContext(brand);
  const clientRequest = input.request ?? new Request('https://session/buyer');

  if (toolId === 'get_size_table') {
    const table = await getSizeTable(input.env, brand);
    return { content: table.content };
  }

  if (toolId === 'search_catalog') {
    const args = parseArgs(input.argsJson);
    const validated = validateSearchCatalogArgs(args);
    if (!validated.ok) {
      return deny(validated.reason, {
        tool: input.name,
        dropped: validated.droppedKeys,
      });
    }
    const catalogChannel = catalogSnapshotChannel(input.channelId);
    const repo = await getCatalogRepository(input.env, catalogChannel, {
      clientRequest,
    });
    const filters: CatalogFilters = {
      text: validated.query,
      ucpIntent: validated.intent,
    };
    if (validated.priceMinMinor !== undefined) filters.priceMin = validated.priceMinMinor;
    if (validated.priceMaxMinor !== undefined) filters.priceMax = validated.priceMaxMinor;

    const { matches, meta } = await repo.search(filters, CATALOG_SEARCH_SERVER_LIMIT);
    const formatted = formatMatchBlock(CATALOG_SEARCH_HEADER, matches, 6);
    console.log(
      JSON.stringify({
        tag: 'buyer.catalog_search',
        channel: input.channelId,
        hasQuery: true,
        priceMin: validated.priceMinMinor ?? null,
        priceMax: validated.priceMaxMinor ?? null,
        ucpIds: matches.map((m) => m.product.productId),
        facts: matches.length,
        filterIgnored: meta?.filterIgnored ?? [],
      }),
    );
    return {
      content: JSON.stringify({
        products: formatted.descriptive,
        technical: formatted.technical || undefined,
        filter_ignored: meta?.filterIgnored,
      }),
      newVariantIds: formatted.variantIds,
    };
  }

  if (toolId === 'search_shop_policies_and_faqs') {
    const args = parseArgs(input.argsJson);
    const query = typeof args.query === 'string' ? args.query : '';
    const context = typeof args.context === 'string' ? args.context : undefined;
    const result = await searchShopPoliciesViaMcp(input.env, query, { context });
    if (!result.ok) {
      return { content: KB_POLICY_UNAVAILABLE_REPLY };
    }
    await recordPolicyTouchIfIdentified(input.env, {
      shopifyCustomerId: input.shopifyCustomerId,
      sessionId: input.sessionId,
      sources: result.sources.map((s) => s.url || s.title),
      contentHash: result.contentHash,
    });
    return {
      content: JSON.stringify({
        answer: result.answer,
        sources: result.sources,
      }),
    };
  }

  // --- cart tools ---
  if (toolId !== 'ucp_cart') {
    return deny('unsupported_tool', { tool: input.name });
  }

  let args = stripModelCartIds(parseArgs(input.argsJson));

  if (input.name === 'update_cart') {
    if (Array.isArray(args.line_items) || (args.cart && typeof args.cart === 'object')) {
      return deny('full_cart_replace_forbidden', { tool: input.name });
    }
  }

  args = filterCartToolArgs(input.name, args);

  if (cartArgsEmptyAfterFilter(input.name, args)) {
    return deny('empty_after_filter', { tool: input.name });
  }

  if (input.name === 'get_cart' || input.name === 'update_cart' || input.name === 'cancel_cart') {
    if (!input.sessionCartId?.trim()) {
      return deny('no_session_cart', { tool: input.name });
    }
  }

  if (input.name === 'create_cart' || input.name === 'update_cart') {
    const collected = collectVariantIdsFromArgs(args);
    if (!collected.ok) {
      return deny(collected.reason, { tool: input.name });
    }
    for (const vid of collected.ids) {
      if (!input.allowedVariantIds.has(vid)) {
        return deny('variant_not_in_channel', { tool: input.name, variant_id: vid });
      }
    }
  }

  // Ensure create_cart uses line_items shape; patches for update go as-is (without ids).
  const mcpOut = await callMcpToolDirect(input.env, input.name, args, {
    brand,
    sessionCartId: input.sessionCartId,
    commerceContext,
  });

  if (mcpOut?.error) {
    const code = mcpOut.error.code;
    if (code === 429) {
      const retryAfter = extractRetryAfterFromDetails(mcpOut.error.details);
      console.warn(
        JSON.stringify({
          tag: 'buyer.tool_rate_limited',
          tool: input.name,
          retry_after: retryAfter ?? null,
        }),
      );
      return { content: CART_UNAVAILABLE };
    }
    return {
      content: JSON.stringify({
        error: { code: mcpOut.error.code },
        notice: CART_UNAVAILABLE,
      }),
    };
  }

  const result = mcpOut.result;
  let nextSessionCartId = input.sessionCartId;

  if (input.name === 'create_cart') {
    const newId = cartIdFromMcpResult(result);
    if (newId && input.sessionId?.trim()) {
      await writeSessionCartId(input.env, input.sessionId, newId);
      nextSessionCartId = newId;
    }
  }

  if (input.name === 'cancel_cart' && input.sessionId?.trim()) {
    await writeSessionCartId(input.env, input.sessionId, '');
    nextSessionCartId = null;
  }

  return {
    content: JSON.stringify(result ?? {}),
    sessionCartId: nextSessionCartId,
  };
}
