import type { Env } from '../config/bindings';
import { resolveCommerceContext } from '../config/commerce-context';
import { callMcpToolDirect } from '../mcp_server';
import { extractCartObject, lineItemsFromCartPayload } from '../cart/ucp-cart';
import { getSizeTable } from '../size-table';
import type { BuyerChannelId } from './channel-switch';
import { buyerToolIdForName } from './buyer-tools';
import {
  KB_POLICY_UNAVAILABLE_REPLY,
  searchShopPoliciesViaMcp,
} from './kb-policies';
import { recordPolicyTouchIfIdentified } from './policy-audit';
import { writeSessionCartId } from './session-cart';
import { brandKeyForChannel, type BuyerToolId } from './tool-readiness';

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
};

export type ExecuteBuyerToolResult = {
  content: string;
  sessionCartId?: string | null;
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

function collectVariantIdsFromArgs(args: Record<string, unknown>): string[] {
  const ids: string[] = [];
  const push = (raw: unknown) => {
    if (typeof raw === 'string' && raw.trim()) ids.push(raw.trim());
  };

  const lineItems = Array.isArray(args.line_items)
    ? args.line_items
    : args.cart && typeof args.cart === 'object' && Array.isArray((args.cart as { line_items?: unknown }).line_items)
      ? ((args.cart as { line_items: unknown[] }).line_items)
      : [];
  for (const line of lineItems) {
    if (!line || typeof line !== 'object') continue;
    const item = (line as { item?: { id?: string }; product_variant_id?: string }).item;
    push(item?.id);
    push((line as { product_variant_id?: string }).product_variant_id);
  }

  if (Array.isArray(args.add_items)) {
    for (const row of args.add_items) {
      if (!row || typeof row !== 'object') continue;
      push((row as { product_variant_id?: string }).product_variant_id);
      const item = (row as { item?: { id?: string } }).item;
      push(item?.id);
    }
  }
  return ids;
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

  if (toolId === 'get_size_table') {
    const table = await getSizeTable(input.env, brand);
    return { content: table.content };
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

  if (input.name === 'get_cart' || input.name === 'update_cart' || input.name === 'cancel_cart') {
    if (!input.sessionCartId?.trim()) {
      return deny('no_session_cart', { tool: input.name });
    }
  }

  if (input.name === 'create_cart' || input.name === 'update_cart') {
    const variantIds = collectVariantIdsFromArgs(args);
    for (const vid of variantIds) {
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
        error: mcpOut.error,
        notice: CART_UNAVAILABLE,
      }),
    };
  }

  const result = mcpOut.result;
  let nextSessionCartId = input.sessionCartId;

  if (input.name === 'create_cart' && !mcpOut.error) {
    const newId = cartIdFromMcpResult(result);
    if (newId && input.sessionId?.trim()) {
      await writeSessionCartId(input.env, input.sessionId, newId);
      nextSessionCartId = newId;
    }
  }

  return {
    content: JSON.stringify(result ?? {}),
    sessionCartId: nextSessionCartId,
  };
}
