/**
 * Narzędzia analityczne wyłącznie dla kanału `internal-dashboard`.
 * Trzy jawne źródła: hurtownia EPIR (RPC), marketing-ingest (GA4+Ads preview), Shopify Admin (ShopifyQL presets).
 */
import type { Env } from './config/bindings';
import { callAdminAPI } from './graphql';
import { chatPipelineLog } from './utils/chat-pipeline-log';

const SHOPIFYQL_OPERATION = `
  query EpirShopifyql($shopifyql: String!) {
    shopifyqlQuery(query: $shopifyql) {
      tableData {
        columns {
          name
          dataType
          displayName
        }
        rows
      }
      parseErrors
    }
  }
`;

export type ShopifyqlTimeGrain = 'day' | 'week' | 'month';

/** Kontrakt presetu: zakres czasu i granulacja są jawne (dokumentacja + przyszła walidacja). */
export type ShopifyQLPresetDefinition = {
  readonly id:
    | 'S1_SALES_SESSIONS_DAILY_30D'
    | 'S2_SALES_SESSIONS_MONTHLY_LAST_YEAR'
    | 'S3_SALES_NET_TOTAL_DAILY_90D'
    | 'S4_SALES_WEEKLY_12W'
    | 'S5_SALES_SESSIONS_DAILY_7D'
    | 'S6_SALES_MONTHLY_13M';
  readonly query: string;
  readonly timeGrain: ShopifyqlTimeGrain;
  readonly maxLookbackDays?: number;
  readonly maxLookbackMonths?: number;
  /**
   * S4–S6: składnia `week` / `SINCE -13m` może nie być dostępna na każdym planie Shopify.
   * Przy niepustym `parseErrors` — korekta jednej linii `query` w tym module; logi workera: shopDomain + presetId + parseErrors.
   */
  readonly planNote?: string;
};

export const SHOPIFYQL_PRESET_DEFINITIONS: readonly ShopifyQLPresetDefinition[] = [
  {
    id: 'S1_SALES_SESSIONS_DAILY_30D',
    query:
      'FROM sales, sessions SHOW day, total_sales, sessions, conversion_rate GROUP BY day SINCE -30d ORDER BY day',
    timeGrain: 'day',
    maxLookbackDays: 30,
  },
  {
    id: 'S2_SALES_SESSIONS_MONTHLY_LAST_YEAR',
    query:
      'FROM sales, sessions SHOW month, total_sales, sessions, conversion_rate GROUP BY month SINCE last_year ORDER BY month',
    timeGrain: 'month',
    maxLookbackMonths: 12,
  },
  {
    id: 'S3_SALES_NET_TOTAL_DAILY_90D',
    query: 'FROM sales SHOW day, net_sales, total_sales GROUP BY day SINCE -90d ORDER BY day',
    timeGrain: 'day',
    maxLookbackDays: 90,
  },
  {
    id: 'S4_SALES_WEEKLY_12W',
    query: 'FROM sales SHOW week, total_sales, net_sales GROUP BY week SINCE -12w ORDER BY week',
    timeGrain: 'week',
    maxLookbackDays: 84,
    planNote: 'Weekly grain — verify on your Shopify plan if parseErrors appear.',
  },
  {
    id: 'S5_SALES_SESSIONS_DAILY_7D',
    query:
      'FROM sales, sessions SHOW day, total_sales, sessions, conversion_rate GROUP BY day SINCE -7d ORDER BY day',
    timeGrain: 'day',
    maxLookbackDays: 7,
  },
  {
    id: 'S6_SALES_MONTHLY_13M',
    query: 'FROM sales SHOW month, total_sales, net_sales GROUP BY month SINCE -13m ORDER BY month',
    timeGrain: 'month',
    maxLookbackMonths: 13,
    planNote: 'Relative month window — verify SINCE -13m on your plan if parseErrors appear.',
  },
] as const;

export type ShopifyqlPresetId = (typeof SHOPIFYQL_PRESET_DEFINITIONS)[number]['id'];

export const SHOPIFYQL_PRESET_IDS: readonly ShopifyqlPresetId[] = SHOPIFYQL_PRESET_DEFINITIONS.map((d) => d.id);

const SHOPIFYQL_QUERY_BY_ID: Record<ShopifyqlPresetId, string> = Object.fromEntries(
  SHOPIFYQL_PRESET_DEFINITIONS.map((d) => [d.id, d.query]),
) as Record<ShopifyqlPresetId, string>;

export function getShopifyqlPresetDefinition(id: ShopifyqlPresetId): ShopifyQLPresetDefinition | undefined {
  return SHOPIFYQL_PRESET_DEFINITIONS.find((d) => d.id === id);
}

export function isShopifyqlPresetId(id: string): id is ShopifyqlPresetId {
  return (SHOPIFYQL_PRESET_IDS as readonly string[]).includes(id);
}

export type ShopifyqlParseBlock = {
  tableData?: { columns?: unknown[]; rows?: unknown[] } | null;
  parseErrors?: unknown[] | null;
};

/** Błąd domenowy gdy Shopify zwróci niepuste parseErrors — agent nie powinien retry w pętli. */
export type ShopifyQLPresetExecutionError = {
  code: -32002;
  message: 'ShopifyQLPresetExecutionError';
  presetId: ShopifyqlPresetId;
  parseErrors: unknown[];
  rawQuery: string;
  hint: string;
};

/**
 * Mapuje odpowiedź Admin API shopifyqlQuery na wynik narzędzia lub błąd.
 * - parseErrors.length > 0 → wyłącznie błąd (bez „sukcesu” z surowymi parseErrors).
 * - parseErrors puste + brak wierszy → sukces z empty: true (różne od błędu składni).
 */
export function interpretShopifyqlToolPayload(
  presetId: ShopifyqlPresetId,
  rawQuery: string,
  block: ShopifyqlParseBlock | null | undefined,
  meta: Pick<ShopifyQLPresetDefinition, 'timeGrain' | 'maxLookbackDays' | 'maxLookbackMonths'>,
):
  | { ok: true; result: Record<string, unknown> }
  | { ok: false; error: ShopifyQLPresetExecutionError } {
  const parseErrors = Array.isArray(block?.parseErrors) ? block!.parseErrors! : [];
  if (parseErrors.length > 0) {
    return {
      ok: false,
      error: {
        code: -32002,
        message: 'ShopifyQLPresetExecutionError',
        presetId,
        parseErrors,
        rawQuery,
        hint:
          'Raport może być niedostępny na tym sklepie lub planie Shopify, albo wymaga korekty presetu w repozytorium. Nie wywołuj ponownie tego samego presetId w pętli; spróbuj innego presetu albo run_analytics_query / fetch_marketing_preview.',
      },
    };
  }

  const rows = block?.tableData?.rows;
  const rowCount = Array.isArray(rows) ? rows.length : 0;
  return {
    ok: true,
    result: {
      source: 'shopify_shopifyql',
      presetId,
      timeGrain: meta.timeGrain,
      maxLookbackDays: meta.maxLookbackDays ?? null,
      maxLookbackMonths: meta.maxLookbackMonths ?? null,
      tableData: block?.tableData ?? null,
      rowCount,
      empty: rowCount === 0,
    },
  };
}

/** `run_analytics_query` — RPC do epir-bigquery-batch (whitelist queryId). */
export async function runWarehouseAnalyticsQuery(
  env: Env,
  args: { queryId?: string },
): Promise<{ result?: unknown; error?: unknown }> {
  const t0 = Date.now();
  const rpc = env.BIGQUERY_BATCH_RPC;
  if (!rpc) {
    chatPipelineLog({
      phase: 'analytics_bigquery_tool',
      duration_ms: Date.now() - t0,
      ok: false,
      reason: 'binding_missing',
    });
    return {
      error: { code: -32603, message: 'run_analytics_query not configured (BIGQUERY_BATCH_RPC binding missing)' },
    };
  }
  const queryId = args?.queryId;
  if (!queryId || typeof queryId !== 'string') {
    chatPipelineLog({
      phase: 'analytics_bigquery_tool',
      duration_ms: Date.now() - t0,
      ok: false,
      reason: 'query_id_required',
    });
    return { error: { code: -32602, message: 'queryId required' } };
  }
  try {
    const data = await rpc.runAnalyticsQuery({ queryId });
    if (!data.ok) {
      chatPipelineLog({
        phase: 'analytics_bigquery_tool',
        duration_ms: Date.now() - t0,
        ok: false,
        queryId,
        http_status: data.status,
      });
      return { error: { code: data.status, message: data.error } };
    }
    const rows = data.rows ?? [];
    const rowCount = Array.isArray(rows) ? rows.length : 0;
    chatPipelineLog({
      phase: 'analytics_bigquery_tool',
      duration_ms: Date.now() - t0,
      ok: true,
      queryId,
      row_count: rowCount,
    });
    // #region agent log
    fetch('http://127.0.0.1:7457/ingest/49605965-4d1e-4f49-8545-82fd58eedfca', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-Debug-Session-Id': 'b07ff0' },
      body: JSON.stringify({
        sessionId: 'b07ff0',
        location: 'chat/internal-analytics-tools.ts:runWarehouseAnalyticsQuery',
        message: 'warehouse_query_ok',
        data: { queryId, rowCount },
        timestamp: Date.now(),
        hypothesisId: 'H1',
      }),
    }).catch(() => {});
    // #endregion
    return {
      result: {
        source: 'epir_warehouse',
        queryId: data.queryId,
        rows,
      },
    };
  } catch (e: any) {
    chatPipelineLog({
      phase: 'analytics_bigquery_tool',
      duration_ms: Date.now() - t0,
      ok: false,
      queryId,
      exception: true,
    });
    return { error: { code: -32000, message: e?.message ?? 'run_analytics_query failed' } };
  }
}

export async function fetchMarketingPreviewTool(
  env: Env,
  args: { date?: string },
): Promise<{ result?: unknown; error?: unknown }> {
  const t0 = Date.now();
  const origin = (env.MARKETING_INGEST_ORIGIN ?? '').trim().replace(/\/$/, '');
  const bearer = (env.MARKETING_OPS_PREVIEW_KEY ?? '').trim();
  if (!origin || !bearer) {
    chatPipelineLog({
      phase: 'marketing_preview_tool',
      duration_ms: Date.now() - t0,
      ok: false,
      reason: 'not_configured',
    });
    return {
      error: {
        code: -32603,
        message:
          'fetch_marketing_preview not configured (set var MARKETING_INGEST_ORIGIN and secret MARKETING_OPS_PREVIEW_KEY on chat worker)',
      },
    };
  }
  const dateRaw = args?.date;
  const date =
    typeof dateRaw === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(dateRaw.trim()) ? dateRaw.trim() : undefined;
  try {
    const u = new URL('/ops/marketing-preview', `${origin}/`);
    if (date) u.searchParams.set('date', date);
    const r = await fetch(u.toString(), {
      method: 'GET',
      headers: {
        Authorization: `Bearer ${bearer}`,
        Accept: 'application/json',
      },
      signal: AbortSignal.timeout(25_000),
    });
    if (!r.ok) {
      const body = await r.text().catch(() => '');
      chatPipelineLog({
        phase: 'marketing_preview_tool',
        duration_ms: Date.now() - t0,
        ok: false,
        http_status: r.status,
      });
      return {
        error: {
          code: r.status,
          message: `marketing-preview HTTP ${r.status}`,
          details: body.slice(0, 800),
        },
      };
    }
    const json = (await r.json()) as Record<string, unknown>;
    const ga = json.google_analytics as { rowCount?: number } | undefined;
    const ads = json.google_ads as { rowCount?: number } | undefined;
    chatPipelineLog({
      phase: 'marketing_preview_tool',
      duration_ms: Date.now() - t0,
      ok: true,
    });
    // #region agent log
    fetch('http://127.0.0.1:7457/ingest/49605965-4d1e-4f49-8545-82fd58eedfca', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-Debug-Session-Id': 'b07ff0' },
      body: JSON.stringify({
        sessionId: 'b07ff0',
        location: 'chat/internal-analytics-tools.ts:fetchMarketingPreviewTool',
        message: 'marketing_preview_ok',
        data: {
          dateParam: date ?? 'default_yesterday_utc',
          previewDate: json.date,
          gaRowCount: ga?.rowCount ?? null,
          adsRowCount: ads?.rowCount ?? null,
        },
        timestamp: Date.now(),
        hypothesisId: 'H2',
      }),
    }).catch(() => {});
    // #endregion
    return {
      result: {
        source: 'marketing_preview',
        endpoint: 'GET /ops/marketing-preview',
        payload: json,
      },
    };
  } catch (e: any) {
    chatPipelineLog({
      phase: 'marketing_preview_tool',
      duration_ms: Date.now() - t0,
      ok: false,
      exception: true,
    });
    return { error: { code: -32000, message: e?.message ?? 'fetch_marketing_preview failed' } };
  }
}

export async function runShopifyShopifyqlTool(
  env: Env,
  args: { presetId?: string },
): Promise<{ result?: unknown; error?: unknown }> {
  const t0 = Date.now();
  const shopDomain = (env.SHOP_DOMAIN ?? '').trim();
  const adminToken = (env.SHOPIFY_ADMIN_TOKEN ?? '').trim();
  if (!shopDomain || !adminToken) {
    chatPipelineLog({
      phase: 'shopify_shopifyql_tool',
      duration_ms: Date.now() - t0,
      ok: false,
      reason: 'missing_shop_or_token',
    });
    return {
      error: {
        code: -32603,
        message: 'run_shopify_shopifyql requires SHOP_DOMAIN and SHOPIFY_ADMIN_TOKEN (with read_reports on the app)',
      },
    };
  }
  const presetId = args?.presetId;
  if (!presetId || typeof presetId !== 'string' || !isShopifyqlPresetId(presetId)) {
    return { error: { code: -32602, message: 'presetId must be one of the whitelisted ShopifyQL presets' } };
  }
  const def = getShopifyqlPresetDefinition(presetId);
  if (!def) {
    return { error: { code: -32602, message: 'preset definition missing' } };
  }
  const shopifyql = SHOPIFYQL_QUERY_BY_ID[presetId];
  try {
    type ShopifyqlResponse = {
      shopifyqlQuery?: ShopifyqlParseBlock;
    };
    const data = await callAdminAPI<ShopifyqlResponse>(shopDomain, adminToken, SHOPIFYQL_OPERATION, {
      shopifyql,
    });
    const block = data?.shopifyqlQuery;
    const outcome = interpretShopifyqlToolPayload(presetId, shopifyql, block, {
      timeGrain: def.timeGrain,
      maxLookbackDays: def.maxLookbackDays,
      maxLookbackMonths: def.maxLookbackMonths,
    });

    if (!outcome.ok) {
      chatPipelineLog({
        phase: 'shopify_shopifyql_tool',
        duration_ms: Date.now() - t0,
        ok: false,
        shop_domain: shopDomain,
        preset_id: presetId,
        parse_errors: outcome.error.parseErrors,
      });
      return { error: outcome.error };
    }

    chatPipelineLog({
      phase: 'shopify_shopifyql_tool',
      duration_ms: Date.now() - t0,
      ok: true,
      shop_domain: shopDomain,
      preset_id: presetId,
      row_count: outcome.result.rowCount,
      empty: outcome.result.empty,
    });
    return { result: outcome.result };
  } catch (e: any) {
    chatPipelineLog({
      phase: 'shopify_shopifyql_tool',
      duration_ms: Date.now() - t0,
      ok: false,
      shop_domain: shopDomain,
      preset_id: presetId,
      exception: true,
    });
    return { error: { code: -32000, message: e?.message ?? 'run_shopify_shopifyql failed' } };
  }
}
