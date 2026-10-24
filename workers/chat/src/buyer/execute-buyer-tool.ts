import type { Env } from '../config/bindings';
import { resolveCommerceContext } from '../config/commerce-context';
import { callMcpToolDirect } from '../mcp_server';
import {
  applyCartPatch,
  cartShapeKeyNames,
  extractCartObject,
  lineItemsFromCartPayload,
  preservedCartStateFields,
  readCartId,
  variantIdOf,
} from '../cart/ucp-cart';
import {
  formatCartErrorFromMessages,
  formatCartNoticeFromMessages,
  formatCartTotalsNote,
} from './cart-continue-reply';
import {
  CART_NOT_FOUND_CLIENT_MESSAGE,
  isCartNotFoundResult,
} from './cart-not-found';
import {
  continueUrlFromCartPayload,
  normalizeCartPayloadForParsing,
} from './cart-payload-normalize';
import { getSizeTable } from '../size-table';
import type { BuyerChannelId } from './channel-switch';
import { buyerToolIdForName } from './buyer-tools';
import {
  kbPolicyMissReply,
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
import {
  collectCartAddsWithOptions,
  mergeCatalogMatchesIntoIndex,
  resolveVariantSwapFromCart,
  stripSelectedOptionsFromCartArgs,
  validateCartAddsAgainstIndex,
  type SelectedOption,
  type VariantOptionIndex,
} from './variant-option-gate';

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
  variantOptionIndex?: VariantOptionIndex;
  shopifyCustomerId?: string | null;
  request?: Request;
};

export type ExecuteBuyerToolResult = {
  content: string;
  sessionCartId?: string | null;
  newVariantIds?: string[];
  /** Sukces create_cart/update_cart w tej turze (nie samo sessionCartId z historii). */
  cartMutationSucceeded?: boolean;
  /** Exact continue_url z wyniku Shopify po udanej mutacji (bez UTM). */
  continueUrl?: string;
  cartNotices?: string[];
  cartTotalsNote?: string | null;
  /** Surowy wynik koszyka po udanej mutacji (do deterministycznego potwierdzenia). */
  cartMutationPayload?: unknown;
  /** messages type=error — treść dla klienta, bez continue_url. */
  cartClientErrors?: string[];
};

function logBuyerToolCall(tool: string, channel: BuyerChannelId, ok: boolean): void {
  console.log(JSON.stringify({ tag: 'buyer.tool_call', tool, channel, ok }));
}

function deny(
  input: Pick<ExecuteBuyerToolInput, 'name' | 'channelId'>,
  reason: string,
  extra?: Record<string, unknown>,
): ExecuteBuyerToolResult {
  logBuyerToolCall(input.name, input.channelId, false);
  console.log(
    JSON.stringify({
      tag: 'buyer.tool_denied',
      reason,
      ...extra,
    }),
  );
  const notice =
    reason === 'variant_not_in_channel'
      ? 'Ten wariant nie jest dostępny w tym kanale w tej turze — wybierz pozycję z wyniku wyszukiwania lub bloku produktów w kontekście.'
      : 'Narzędzie niedostępne w tej turze — nie twierdź o wyniku z pamięci.';
  return {
    content: JSON.stringify({
      error: 'tool_denied',
      reason,
      notice,
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

export function cartIdFromMcpResult(result: unknown): string | null {
  const normalized = normalizeCartPayloadForParsing(result);
  const cart = extractCartObject(normalized);
  if (cart) {
    const id = readCartId(cart);
    if (id) return id;
  }
  if (result && typeof result === 'object') {
    const presented = result as Record<string, unknown>;
    const fromTop = readCartId(presented);
    if (fromTop) return fromTop;
  }
  return null;
}

function cartMessagesHaveError(result: unknown): boolean {
  const normalized = normalizeCartPayloadForParsing(result);
  const cart = extractCartObject(normalized);
  const messages = cart && Array.isArray(cart.messages) ? cart.messages : null;
  if (!messages) {
    if (result && typeof result === 'object') {
      const top = result as Record<string, unknown>;
      if (Array.isArray(top.messages)) {
        return top.messages.some(
          (m) =>
            m &&
            typeof m === 'object' &&
            (m as Record<string, unknown>).type === 'error',
        );
      }
    }
    return false;
  }
  return messages.some(
    (m) =>
      m && typeof m === 'object' && (m as Record<string, unknown>).type === 'error',
  );
}

/** create/update: sukces tylko bez isError, z id koszyka i bez messages type=error. */
export function isSuccessfulCartMutationResult(result: unknown): boolean {
  if (!result || typeof result !== 'object') return false;
  const rec = result as Record<string, unknown>;
  if (rec.isError === true) return false;
  if (
    rec.structuredContent &&
    typeof rec.structuredContent === 'object' &&
    (rec.structuredContent as Record<string, unknown>).isError === true
  ) {
    return false;
  }
  if (!cartIdFromMcpResult(result)) return false;
  if (cartMessagesHaveError(result)) return false;
  return true;
}

/** Variant ids already in the session cart (from server get_cart / payload). */
export function variantIdsFromCartPayload(payload: unknown): string[] {
  const lines = lineItemsFromCartPayload(normalizeCartPayloadForParsing(payload));
  return lines.map((l) => l.item.id).filter(Boolean);
}

export async function executeBuyerTool(
  input: ExecuteBuyerToolInput,
): Promise<ExecuteBuyerToolResult> {
  const toolId = buyerToolIdForName(input.name);
  if (!toolId || !input.readyTools.includes(toolId)) {
    return deny(input, 'not_in_readiness', { tool: input.name });
  }

  const brand = brandKeyForChannel(input.channelId);
  const commerceContext = resolveCommerceContext(brand);
  const clientRequest = input.request ?? new Request('https://session/buyer');

  if (toolId === 'get_size_table') {
    const table = await getSizeTable(input.env, brand);
    logBuyerToolCall(input.name, input.channelId, true);
    return { content: table.content };
  }

  if (toolId === 'search_catalog') {
    const args = parseArgs(input.argsJson);
    const validated = validateSearchCatalogArgs(args);
    if (!validated.ok) {
      return deny(input, validated.reason, {
        tool: input.name,
        dropped: validated.droppedKeys,
      });
    }
    const catalogChannel = catalogSnapshotChannel(input.channelId);
    const repo = await getCatalogRepository(input.env, catalogChannel, {
      clientRequest,
      urlChannel: input.channelId,
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
    if (input.variantOptionIndex) {
      mergeCatalogMatchesIntoIndex(input.variantOptionIndex, matches);
    }
    logBuyerToolCall(input.name, input.channelId, true);
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
      logBuyerToolCall(input.name, input.channelId, false);
      return { content: kbPolicyMissReply(result.reason) };
    }
    await recordPolicyTouchIfIdentified(input.env, {
      shopifyCustomerId: input.shopifyCustomerId,
      sessionId: input.sessionId,
      sources: result.sources.map((s) => s.url || s.title),
      contentHash: result.contentHash,
    });
    logBuyerToolCall(input.name, input.channelId, true);
    return {
      content: JSON.stringify({
        answer: result.answer,
        sources: result.sources,
      }),
    };
  }

  // --- cart tools ---
  if (toolId !== 'ucp_cart') {
    return deny(input, 'unsupported_tool', { tool: input.name });
  }

  let args = stripModelCartIds(parseArgs(input.argsJson));

  if (input.name === 'update_cart') {
    if (Array.isArray(args.line_items) || (args.cart && typeof args.cart === 'object')) {
      return deny(input, 'full_cart_replace_forbidden', { tool: input.name });
    }
  }

  args = filterCartToolArgs(input.name, args);

  if (cartArgsEmptyAfterFilter(input.name, args)) {
    return deny(input, 'empty_after_filter', { tool: input.name });
  }

  if (input.name === 'get_cart' || input.name === 'update_cart' || input.name === 'cancel_cart') {
    if (!input.sessionCartId?.trim()) {
      return deny(input, 'no_session_cart', { tool: input.name });
    }
  }

  // Wczesna walidacja jawnych variant_id (przed get_cart) — bez MCP przy obcym GID.
  if (input.name === 'create_cart' || input.name === 'update_cart') {
    const early = collectVariantIdsFromArgs(args);
    if (!early.ok) {
      return deny(input, early.reason, { tool: input.name });
    }
    for (const vid of early.ids) {
      if (!input.allowedVariantIds.has(vid)) {
        return deny(input, 'variant_not_in_channel', { tool: input.name, variant_id: vid });
      }
    }
  }

  // update_cart: get_cart → ewentualny swap opcji → full replacement + attribution.
  // https://shopify.dev/docs/agents/carts-and-checkout/cart-mcp
  // https://ucp.dev/2026-08-25/specification/shopping/cart/
  let mcpArgs: Record<string, unknown> = args;
  let updateExistingLines: ReturnType<typeof lineItemsFromCartPayload> | null = null;
  let updateExistingCart: Record<string, unknown> | null = null;

  if (input.name === 'update_cart' && input.sessionCartId?.trim()) {
    const getOut = await callMcpToolDirect(input.env, 'get_cart', {}, {
      brand,
      sessionCartId: input.sessionCartId,
      commerceContext,
    });
    const getPayload = getOut?.result ?? getOut;
    if (getOut?.error || isCartNotFoundResult(getPayload)) {
      logBuyerToolCall(input.name, input.channelId, false);
      console.log(
        JSON.stringify({
          tag: 'buyer.cart_not_found',
          tool: 'update_cart',
          via: getOut?.error ? 'protocol_error' : 'messages_not_found',
        }),
      );
      return {
        content: JSON.stringify({
          error: 'cart_not_found',
          notice: CART_NOT_FOUND_CLIENT_MESSAGE,
        }),
      };
    }
    const existingPayload = normalizeCartPayloadForParsing(getPayload);
    updateExistingCart = extractCartObject(existingPayload) ?? {};
    updateExistingLines = lineItemsFromCartPayload(existingPayload);

    // Dziedziczenie selected_options z dokładnie jednej linii produktu.
    if (input.variantOptionIndex && Array.isArray(args.add_items)) {
      const addRows = args.add_items as Record<string, unknown>[];
      for (let i = 0; i < addRows.length; i++) {
        const row = addRows[i];
        if (!row || typeof row !== 'object') continue;
        const partial = Array.isArray(row.selected_options)
          ? (row.selected_options as SelectedOption[]).filter(
              (o) => o && typeof o.name === 'string' && typeof o.value === 'string',
            )
          : [];
        if (!partial.length) continue;
        const removeIds = Array.isArray(args.remove_line_ids)
          ? (args.remove_line_ids as unknown[]).filter((id): id is string => typeof id === 'string')
          : [];
        const cartLines = updateExistingLines.map((l) => ({
          lineId: l.lineId,
          variantId: l.item.id,
        }));
        const resolved = resolveVariantSwapFromCart(
          input.variantOptionIndex,
          cartLines,
          partial.map((o) => ({ name: String(o.name).trim(), value: String(o.value).trim() })),
          removeIds,
        );
        if (resolved.status === 'ambiguous_lines') {
          logBuyerToolCall(input.name, input.channelId, false);
          return {
            content: JSON.stringify({
              status: 'ambiguous_lines',
              notice:
                'W koszyku jest kilka pozycji tego produktu. Proszę wskazać, którą zmienić — po nazwie i opcjach (nie po identyfikatorze linii).',
              choices: resolved.choices,
            }),
          };
        }
        if (
          resolved.status === 'variant_unavailable' ||
          resolved.status === 'no_cart_line' ||
          resolved.status === 'option_name_unknown' ||
          resolved.status === 'option_value_out_of_range' ||
          resolved.status === 'variant_not_for_sale'
        ) {
          logBuyerToolCall(input.name, input.channelId, false);
          return {
            content: JSON.stringify({
              status: resolved.status,
              notice: resolved.notice,
            }),
          };
        }
        if (resolved.status === 'ok') {
          input.allowedVariantIds.add(resolved.targetVariantId);
          const qty =
            typeof row.quantity === 'number' && row.quantity >= 1
              ? row.quantity
              : 1;
          addRows[i] = {
            quantity: qty,
            item: { id: resolved.targetVariantId },
            selected_options: resolved.selectedOptions,
          };
          const removes = new Set(removeIds);
          removes.add(resolved.removeLineId);
          args = {
            ...args,
            add_items: addRows,
            remove_line_ids: [...removes],
          };
        }
      }
    }
  }

  if (input.name === 'create_cart' || input.name === 'update_cart') {
    const collected = collectVariantIdsFromArgs(args);
    if (!collected.ok) {
      return deny(input, collected.reason, { tool: input.name });
    }
    for (const vid of collected.ids) {
      if (!input.allowedVariantIds.has(vid)) {
        return deny(input, 'variant_not_in_channel', { tool: input.name, variant_id: vid });
      }
    }
    const adds = collectCartAddsWithOptions(input.name, args);
    const gateFail = input.variantOptionIndex
      ? validateCartAddsAgainstIndex(input.variantOptionIndex, adds)
      : null;
    if (gateFail) {
      logBuyerToolCall(input.name, input.channelId, false);
      console.log(
        JSON.stringify({
          tag: 'buyer.variant_option_gate',
          status: gateFail.status,
          variant_id: gateFail.variant_id,
        }),
      );
      const notice =
        gateFail.status === 'needs_option'
          ? 'Wybierz wariant (np. rozmiar) zanim dodamy produkt do koszyka.'
          : gateFail.status === 'variant_options_unknown'
            ? 'Sprawdź produkt w katalogu i podaj wariant.'
            : 'Wybrany wariant nie odpowiada podanej opcji — popraw wybór.';
      return {
        content: JSON.stringify({
          ...gateFail,
          notice,
        }),
      };
    }
    args = stripSelectedOptionsFromCartArgs(args);
  }

  if (
    input.name === 'update_cart' &&
    input.sessionCartId?.trim() &&
    updateExistingLines &&
    updateExistingCart
  ) {
    const mergedLines = applyCartPatch(updateExistingLines, args);
    const preserved = preservedCartStateFields({}, updateExistingCart);
    mcpArgs = {
      id: input.sessionCartId.trim(),
      cart: {
        line_items: mergedLines,
        ...preserved,
      },
    };
    if (
      mcpArgs.cart &&
      typeof mcpArgs.cart === 'object' &&
      'id' in (mcpArgs.cart as object)
    ) {
      delete (mcpArgs.cart as Record<string, unknown>).id;
    }
  }

  const mcpOut = await callMcpToolDirect(input.env, input.name, mcpArgs, {
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
      logBuyerToolCall(input.name, input.channelId, false);
      return { content: CART_UNAVAILABLE };
    }
    logBuyerToolCall(input.name, input.channelId, false);
    return {
      content: JSON.stringify({
        error: { code: mcpOut.error.code },
        notice: CART_UNAVAILABLE,
      }),
    };
  }

  const result = mcpOut.result;
  let nextSessionCartId = input.sessionCartId;
  let cartMutationSucceeded = false;

  if (input.name === 'create_cart' || input.name === 'update_cart') {
    // TODO: usunąć po potwierdzeniu kształtu
    const shape = cartShapeKeyNames(result);
    console.log(
      JSON.stringify({
        tag: 'buyer.cart_shape',
        tool: input.name,
        resultKeys: shape.resultKeys,
        structuredContentKeys: shape.structuredContentKeys,
        contentTextKeys: shape.contentTextKeys,
      }),
    );

    // UCP messages type=error: treść klientowi, bez continue_url.
    // not_found → wyczyść koszyk sesji.
    // @see https://shopify.dev/docs/agents/carts-and-checkout/cart-mcp
    // @see https://ucp.dev/2026-08-25/specification/shopping/cart/
    if (cartMessagesHaveError(result) || isCartNotFoundResult(result)) {
      const normalized = normalizeCartPayloadForParsing(result);
      const cart = extractCartObject(normalized);
      const errors = formatCartErrorFromMessages(cart?.messages);
      const clientErrors =
        errors.length > 0
          ? errors
          : isCartNotFoundResult(result)
            ? [CART_NOT_FOUND_CLIENT_MESSAGE]
            : ['Nie udało się zaktualizować koszyka. Proszę spróbować ponownie.'];
      if (isCartNotFoundResult(result) && input.sessionId?.trim()) {
        await writeSessionCartId(input.env, input.sessionId, '');
        nextSessionCartId = null;
        console.log(
          JSON.stringify({
            tag: 'buyer.cart_not_found',
            tool: input.name,
            via: 'messages_not_found',
            cleared_session: true,
          }),
        );
      }
      logBuyerToolCall(input.name, input.channelId, false);
      return {
        content: JSON.stringify({
          status: 'cart_error',
          messages: clientErrors,
          notice: clientErrors.join('\n\n'),
        }),
        sessionCartId: nextSessionCartId,
        cartClientErrors: clientErrors,
      };
    }
  }

  if (input.name === 'create_cart') {
    const newId = cartIdFromMcpResult(result);
    let persisted = false;
    if (newId && input.sessionId?.trim()) {
      await writeSessionCartId(input.env, input.sessionId, newId);
      nextSessionCartId = newId;
      persisted = true;
    }
    cartMutationSucceeded =
      isSuccessfulCartMutationResult(result) && Boolean(newId && persisted);
    console.log(
      JSON.stringify({
        tag: 'buyer.cart_created',
        brand,
        has_id: Boolean(newId),
        persisted,
      }),
    );
  }

  if (input.name === 'update_cart') {
    cartMutationSucceeded = isSuccessfulCartMutationResult(result);
  }

  if (input.name === 'cancel_cart' && input.sessionId?.trim()) {
    await writeSessionCartId(input.env, input.sessionId, '');
    nextSessionCartId = null;
  }

  let continueUrl: string | undefined;
  let cartNotices: string[] | undefined;
  let cartTotalsNote: string | null | undefined;
  if (cartMutationSucceeded) {
    const normalized = normalizeCartPayloadForParsing(result);
    const cart = extractCartObject(normalized);
    const url = continueUrlFromCartPayload(normalized);
    if (url) continueUrl = url;
    const notices = formatCartNoticeFromMessages(cart?.messages);
    if (notices.length) cartNotices = notices;
    const currency =
      typeof cart?.currency === 'string' ? cart.currency : null;
    cartTotalsNote = formatCartTotalsNote(cart?.totals, currency) ?? null;
  }

  logBuyerToolCall(input.name, input.channelId, true);
  return {
    content: JSON.stringify(result ?? {}),
    sessionCartId: nextSessionCartId,
    ...(cartMutationSucceeded ? {cartMutationSucceeded: true} : {}),
    ...(cartMutationSucceeded ? {cartMutationPayload: result} : {}),
    ...(continueUrl ? {continueUrl} : {}),
    ...(cartNotices ? {cartNotices} : {}),
    ...(cartTotalsNote ? {cartTotalsNote} : {}),
  };
}
