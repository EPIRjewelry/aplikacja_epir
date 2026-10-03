/**
 * Cart MCP (UCP) — create/get/update/cancel na POST /api/ucp/mcp.
 * update_cart ma semantykę PUT: brak pozycji w line_items usuwa ją z koszyka.
 * Stary kształt add_items/update_items/remove_line_ids jest składany w pełną listę
 * (przy istniejącym koszyku po odczycie get_cart), żeby dopisek nie kasował reszty.
 */

import { ensureUcpAgentMeta } from '../catalog/ucp-agent-meta';
import type { CommerceContext } from '../config/commerce-context';
import { plnDisplayFromUcpMoney } from '../mcp/catalog-price-enrich';

export const UCP_CART_TOOL_NAMES = new Set([
  'create_cart',
  'get_cart',
  'update_cart',
  'cancel_cart',
]);

export type UcpCartLine = {
  quantity: number;
  item: { id: string };
};

export type PreparedUcpCart =
  | { ok: true; mcpToolName: string; arguments: Record<string, unknown>; needsExistingLines: boolean }
  | { ok: false; error: { code: number; message: string } };

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function nonEmpty(value: unknown): value is string {
  return typeof value === 'string' && value.trim().length > 0;
}

function asInt(value: unknown): number | null {
  if (typeof value === 'number' && Number.isFinite(value)) return Math.trunc(value);
  if (typeof value === 'string' && value.trim() && Number.isFinite(Number(value))) {
    return Math.trunc(Number(value));
  }
  return null;
}

export function isUcpCartTool(toolName: string): boolean {
  return UCP_CART_TOOL_NAMES.has(toolName);
}

export function readCartId(source: Record<string, unknown>): string | null {
  if (nonEmpty(source.id) && source.id.startsWith('gid://shopify/Cart/')) return source.id.trim();
  if (nonEmpty(source.cart_id)) return source.cart_id.trim();
  return null;
}

function variantIdOf(item: Record<string, unknown>): string {
  if (nonEmpty(item.product_variant_id)) return item.product_variant_id.trim();
  if (nonEmpty(item.merchandise_id)) return item.merchandise_id.trim();
  if (nonEmpty(item.variant_id)) return item.variant_id.trim();
  if (isRecord(item.item) && nonEmpty(item.item.id)) return item.item.id.trim();
  if (nonEmpty(item.id) && item.id.includes('ProductVariant')) return item.id.trim();
  return '';
}

export function parseUcpLineItems(raw: unknown): UcpCartLine[] | null {
  if (!Array.isArray(raw)) return null;
  const lines: UcpCartLine[] = [];
  for (const entry of raw) {
    if (!isRecord(entry)) continue;
    const quantity = asInt(entry.quantity);
    const variantId = variantIdOf(entry);
    if (!variantId || quantity === null || quantity < 1) continue;
    lines.push({ quantity, item: { id: variantId } });
  }
  return lines;
}

function explicitLineItems(source: Record<string, unknown>): UcpCartLine[] | null {
  if (Array.isArray(source.line_items)) return parseUcpLineItems(source.line_items) ?? [];
  if (isRecord(source.cart) && Array.isArray(source.cart.line_items)) {
    return parseUcpLineItems(source.cart.line_items) ?? [];
  }
  return null;
}

function hasPatch(source: Record<string, unknown>): boolean {
  return (
    (Array.isArray(source.add_items) && source.add_items.length > 0) ||
    (Array.isArray(source.update_items) && source.update_items.length > 0) ||
    (Array.isArray(source.remove_line_ids) && source.remove_line_ids.length > 0) ||
    (Array.isArray(source.lines) && source.lines.length > 0)
  );
}

type ExistingLine = UcpCartLine & { lineId?: string };

export function lineItemsFromCartPayload(payload: unknown): ExistingLine[] {
  const cart = extractCartObject(payload);
  const raw = cart && Array.isArray(cart.line_items) ? cart.line_items : [];
  const lines: ExistingLine[] = [];
  for (const entry of raw) {
    if (!isRecord(entry)) continue;
    const quantity = asInt(entry.quantity);
    const variantId = isRecord(entry.item) && nonEmpty(entry.item.id)
      ? entry.item.id.trim()
      : variantIdOf(entry);
    if (!variantId || quantity === null || quantity < 1) continue;
    lines.push({
      quantity,
      item: { id: variantId },
      lineId: nonEmpty(entry.id) ? entry.id.trim() : undefined,
    });
  }
  return lines;
}

function addItemsOf(source: Record<string, unknown>): UcpCartLine[] {
  const raw = Array.isArray(source.add_items) ? source.add_items : [];
  const fromLines = Array.isArray(source.lines) ? source.lines : [];
  const combined = [...raw];
  for (const line of fromLines) {
    if (!isRecord(line)) continue;
    if (nonEmpty(line.line_item_id) || (nonEmpty(line.id) && !variantIdOf(line))) continue;
    if (variantIdOf(line)) combined.push(line);
  }
  return parseUcpLineItems(combined) ?? [];
}

/**
 * Składa patch (add/update/remove) na istniejące pozycje.
 * Wynik to pełna lista do update_cart — czego nie ma, Shopify usuwa.
 */
export function applyCartPatch(existing: ExistingLine[], source: Record<string, unknown>): UcpCartLine[] {
  let next = existing.map((line) => ({ ...line, item: { id: line.item.id } }));

  const removeIds = new Set(
    (Array.isArray(source.remove_line_ids) ? source.remove_line_ids : [])
      .filter((id): id is string => nonEmpty(id))
      .map((id) => id.trim()),
  );
  if (removeIds.size > 0) {
    next = next.filter((line) => !removeIds.has(line.lineId ?? '') && !removeIds.has(line.item.id));
  }

  const updates = Array.isArray(source.update_items) ? source.update_items : [];
  const lineUpdates = Array.isArray(source.lines) ? source.lines : [];
  for (const entry of [...updates, ...lineUpdates]) {
    if (!isRecord(entry)) continue;
    const lineId = nonEmpty(entry.line_item_id)
      ? entry.line_item_id.trim()
      : nonEmpty(entry.id) && !entry.id.includes('ProductVariant')
        ? entry.id.trim()
        : '';
    if (!lineId) continue;
    const quantity = asInt(entry.quantity);
    if (quantity === null) continue;
    if (quantity < 1) {
      next = next.filter((line) => line.lineId !== lineId && line.item.id !== lineId);
      continue;
    }
    const match = next.find((line) => line.lineId === lineId || line.item.id === lineId);
    if (match) match.quantity = quantity;
  }

  for (const added of addItemsOf(source)) {
    const match = next.find((line) => line.item.id === added.item.id);
    if (match) match.quantity += added.quantity;
    else next.push({ quantity: added.quantity, item: { id: added.item.id } });
  }

  return next
    .filter((line) => line.quantity > 0)
    .map((line) => ({ quantity: line.quantity, item: { id: line.item.id } }));
}

function cartContext(commerce?: CommerceContext): Record<string, string> | undefined {
  if (!commerce?.address_country) return undefined;
  return { address_country: commerce.address_country };
}

function withMeta(
  args: Record<string, unknown>,
  env: { UCP_AGENT_PROFILE_URL?: string; WORKER_ORIGIN?: string },
  extraMeta?: Record<string, unknown>,
): Record<string, unknown> {
  const withProfile = ensureUcpAgentMeta(args, env);
  if (!extraMeta) return withProfile;
  const meta = isRecord(withProfile.meta) ? { ...withProfile.meta, ...extraMeta } : extraMeta;
  return { ...withProfile, meta };
}

export function prepareUcpCartCall(
  toolName: string,
  rawArgs: unknown,
  env: { UCP_AGENT_PROFILE_URL?: string; WORKER_ORIGIN?: string },
  commerce?: CommerceContext,
  existingLines?: ExistingLine[] | null,
): PreparedUcpCart {
  const source = isRecord(rawArgs) ? rawArgs : {};
  const cartId = readCartId(source);
  const context = cartContext(commerce);

  if (toolName === 'get_cart') {
    if (!cartId) {
      return { ok: false, error: { code: -32602, message: 'Invalid params: cart id required for get_cart' } };
    }
    return {
      ok: true,
      mcpToolName: 'get_cart',
      needsExistingLines: false,
      arguments: withMeta({ id: cartId }, env),
    };
  }

  if (toolName === 'cancel_cart') {
    if (!cartId) {
      return { ok: false, error: { code: -32602, message: 'Invalid params: cart id required for cancel_cart' } };
    }
    return {
      ok: true,
      mcpToolName: 'cancel_cart',
      needsExistingLines: false,
      arguments: withMeta({ id: cartId }, env, { 'idempotency-key': crypto.randomUUID() }),
    };
  }

  const explicit = explicitLineItems(source);
  const creating = toolName === 'create_cart' || (toolName === 'update_cart' && !cartId);

  if (creating) {
    const lines = explicit ?? (hasPatch(source) ? applyCartPatch([], source) : []);
    if (lines.length === 0) {
      return {
        ok: false,
        error: { code: -32602, message: 'Invalid params: line_items required to create a cart' },
      };
    }
    return {
      ok: true,
      mcpToolName: 'create_cart',
      needsExistingLines: false,
      arguments: withMeta(
        { cart: { line_items: lines, ...(context ? { context } : {}) } },
        env,
      ),
    };
  }

  if (explicit) {
    return {
      ok: true,
      mcpToolName: 'update_cart',
      needsExistingLines: false,
      arguments: withMeta(
        {
          id: cartId,
          cart: { line_items: explicit, ...(context ? { context } : {}) },
        },
        env,
      ),
    };
  }

  if (!hasPatch(source)) {
    return {
      ok: false,
      error: {
        code: -32602,
        message: 'Invalid params: update_cart requires the full line_items array (omitted lines are removed)',
      },
    };
  }

  if (existingLines == null) {
    return {
      ok: true,
      mcpToolName: 'update_cart',
      needsExistingLines: true,
      arguments: {},
    };
  }

  const lines = applyCartPatch(existingLines, source);
  return {
    ok: true,
    mcpToolName: 'update_cart',
    needsExistingLines: false,
    arguments: withMeta(
      {
        id: cartId,
        cart: { line_items: lines, ...(context ? { context } : {}) },
      },
      env,
    ),
  };
}

export function extractCartObject(payload: unknown): Record<string, unknown> | null {
  if (!isRecord(payload)) return null;
  if (isRecord(payload.structuredContent) && isRecord(payload.structuredContent.cart)) {
    return payload.structuredContent.cart;
  }
  if (isRecord(payload.cart) && (payload.cart.continue_url || payload.cart.line_items || payload.cart.id)) {
    return payload.cart;
  }
  const content = payload.content;
  if (Array.isArray(content)) {
    for (const part of content) {
      if (!isRecord(part) || typeof part.text !== 'string') continue;
      try {
        const parsed = JSON.parse(part.text) as unknown;
        const nested = extractCartObject(parsed);
        if (nested) return nested;
      } catch {
        /* text is not cart JSON */
      }
    }
  }
  if (isRecord(payload.result)) return extractCartObject(payload.result);
  return null;
}

function annotateUcpMoney(value: unknown, depth: number): unknown {
  if (depth <= 0 || value == null) return value;
  if (Array.isArray(value)) return value.map((item) => annotateUcpMoney(item, depth - 1));
  if (!isRecord(value)) return value;
  const display = plnDisplayFromUcpMoney(value);
  if (display && (value.amount !== undefined || value.price_minor !== undefined)) {
    return {
      ...value,
      currency: display.currency,
      price_minor: display.price_minor,
      price_display_pl: display.price_display_pl,
    };
  }
  const output: Record<string, unknown> = {};
  for (const [key, child] of Object.entries(value)) {
    output[key] = annotateUcpMoney(child, depth - 1);
  }
  return output;
}

/** Skrót dla modelu: continue_url i price_display_pl, zanim obetnie się JSON. */
export function presentCartForChat(payload: unknown): Record<string, unknown> {
  const cart = extractCartObject(payload);
  if (!cart) return (isRecord(payload) ? annotateUcpMoney(payload, 8) : { raw: payload }) as Record<string, unknown>;
  const continueUrl = nonEmpty(cart.continue_url) ? cart.continue_url.trim() : null;
  return annotateUcpMoney(
    {
      continue_url: continueUrl,
      checkout_url: continueUrl,
      cart_id: nonEmpty(cart.id) ? cart.id.trim() : null,
      currency: nonEmpty(cart.currency) ? cart.currency.trim() : null,
      line_items: Array.isArray(cart.line_items) ? cart.line_items : [],
      totals: Array.isArray(cart.totals) ? cart.totals : [],
      messages: Array.isArray(cart.messages) ? cart.messages : [],
    },
    8,
  ) as Record<string, unknown>;
}
