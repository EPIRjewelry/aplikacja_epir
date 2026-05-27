import type { AnalysisPeriod } from './period';
import { newId } from './period';
import type { StoreSignal } from '@epir/steward-contract';
import {
  RESOLVED_CAMPAIGN_EXPR,
  RESOLVED_MEDIUM_EXPR,
  RESOLVED_SOURCE_EXPR,
  SESSION_LATEST_SUBQUERY,
  TIME_FILTER_PLACEHOLDER,
} from './ham-sql';
import { compareDeterministicVsProbabilistic } from '@epir/ham-core';

/** Udział paid-unknown powyżej progu → insight (Etap D bramka). */
export const PAID_UNKNOWN_THRESHOLD = 0.2;

export type MarketingReconcileEnv = {
  MARKETING_INGEST_ORIGIN?: string;
  MARKETING_OPS_PREVIEW_KEY?: string;
};

type MarketingPreviewBody = {
  google_ads: { topCampaigns: Array<{ campaign_name: string; cost: number; conversions: number }> };
};

async function fetchMarketingPreview(
  env: MarketingReconcileEnv,
  date: string,
): Promise<MarketingPreviewBody | null> {
  const origin = (env.MARKETING_INGEST_ORIGIN ?? '').replace(/\/$/, '');
  const key = env.MARKETING_OPS_PREVIEW_KEY ?? '';
  if (!origin || !key) return null;
  try {
    const res = await fetch(`${origin}/ops/marketing-preview?date=${encodeURIComponent(date)}`, {
      headers: { Authorization: `Bearer ${key}` },
    });
    if (!res.ok) return null;
    return (await res.json()) as MarketingPreviewBody;
  } catch {
    return null;
  }
}

async function insertHamSignal(
  db: D1Database,
  period: AnalysisPeriod,
  row: {
    signal_key: string;
    metric_name: string;
    metric_value: number;
    metric_unit: string;
    evidence_json: Record<string, unknown>;
  },
): Promise<StoreSignal> {
  const id = newId('ham');
  const evidence_json = JSON.stringify(row.evidence_json);
  await db
    .prepare(
      `INSERT INTO store_signals (
        id, period_start, period_end, signal_key, storefront_id, channel,
        product_handle, product_id, metric_name, metric_value, metric_unit, evidence_json, source
      ) VALUES (?1, ?2, ?3, ?4, NULL, NULL, NULL, NULL, ?5, ?6, ?7, ?8, 'd1_pixel')
      ON CONFLICT(id) DO NOTHING`,
    )
    .bind(
      id,
      period.period_start,
      period.period_end,
      row.signal_key,
      row.metric_name,
      row.metric_value,
      row.metric_unit,
      evidence_json,
    )
    .run();
  return {
    id,
    period_start: period.period_start,
    period_end: period.period_end,
    signal_key: row.signal_key,
    storefront_id: null,
    channel: null,
    product_handle: null,
    product_id: null,
    metric_name: row.metric_name,
    metric_value: row.metric_value,
    metric_unit: row.metric_unit,
    evidence_json,
    source: 'd1_pixel',
  };
}

/**
 * Etap B–D: agregacja resolved_* + opcjonalna rekonsyliacja marketing preview + porównanie probabilistyczne.
 */
export async function aggregateHamSignals(
  db: D1Database,
  period: AnalysisPeriod,
  env?: MarketingReconcileEnv,
): Promise<StoreSignal[]> {
  const out: StoreSignal[] = [];
  const cutoff = period.cutoff_ms;

  const byResolved = await db
    .prepare(
      `SELECT
         ${RESOLVED_SOURCE_EXPR} AS resolved_source,
         ${RESOLVED_MEDIUM_EXPR} AS resolved_medium,
         ${RESOLVED_CAMPAIGN_EXPR} AS resolved_campaign,
         COUNT(DISTINCT pe.session_id) AS sessions,
         SUM(CASE WHEN pe.event_type = 'purchase_completed' THEN 1 ELSE 0 END) AS purchases
       FROM pixel_events pe
       INNER JOIN (${SESSION_LATEST_SUBQUERY}) latest
         ON pe.session_id = latest.session_id AND CAST(pe.id AS INTEGER) = latest.max_id
       WHERE ${TIME_FILTER_PLACEHOLDER}
       GROUP BY resolved_source, resolved_medium, resolved_campaign`,
    )
    .bind(cutoff)
    .all<{
      resolved_source: string;
      resolved_medium: string;
      resolved_campaign: string | null;
      sessions: number;
      purchases: number;
    }>();

  for (const row of byResolved.results ?? []) {
    const key = `resolved_${row.resolved_source}_${row.resolved_medium}`;
    out.push(
      await insertHamSignal(db, period, {
        signal_key: key,
        metric_name: 'resolved_session_count',
        metric_value: row.sessions,
        metric_unit: 'count',
        evidence_json: {
          resolved_source: row.resolved_source,
          resolved_medium: row.resolved_medium,
          resolved_campaign: row.resolved_campaign,
          purchases: row.purchases,
        },
      }),
    );
  }

  const paidUnknown = await db
    .prepare(
      `WITH session_latest AS (
         SELECT pe.session_id, pe.traffic_source, pe.traffic_medium, pe.click_id, pe.click_id_type, pe.channel
         FROM pixel_events pe
         INNER JOIN (${SESSION_LATEST_SUBQUERY}) latest
           ON pe.session_id = latest.session_id AND CAST(pe.id AS INTEGER) = latest.max_id
         WHERE ${TIME_FILTER_PLACEHOLDER}
       ),
       classified AS (
         SELECT
           session_id,
           ${RESOLVED_SOURCE_EXPR} AS resolved_source,
           CASE
             WHEN click_id IS NOT NULL OR LOWER(COALESCE(traffic_medium, '')) IN ('cpc', 'ppc', 'paid')
             THEN 1 ELSE 0
           END AS is_paid
         FROM session_latest pe
       )
       SELECT
         SUM(CASE WHEN is_paid = 1 AND resolved_source IN ('unknown', 'direct') THEN 1 ELSE 0 END) AS paid_unknown_sessions,
         SUM(CASE WHEN is_paid = 1 THEN 1 ELSE 0 END) AS paid_total
       FROM classified`,
    )
    .bind(cutoff)
    .first<{ paid_unknown_sessions: number; paid_total: number }>();

  const paidUnknownSessions = paidUnknown?.paid_unknown_sessions ?? 0;
  const paidTotal = paidUnknown?.paid_total ?? 0;
  const paidUnknownShare = paidTotal > 0 ? paidUnknownSessions / paidTotal : 0;

  out.push(
    await insertHamSignal(db, period, {
      signal_key: 'ham_paid_unknown_share',
      metric_name: 'paid_unknown_share',
      metric_value: paidUnknownShare,
      metric_unit: 'ratio',
      evidence_json: {
        paid_unknown_sessions: paidUnknownSessions,
        paid_total: paidTotal,
        threshold: PAID_UNKNOWN_THRESHOLD,
        gate_pass: paidUnknownShare < PAID_UNKNOWN_THRESHOLD,
      },
    }),
  );

  const sessionRows = await db
    .prepare(
      `SELECT
         pe.session_id,
         ${RESOLVED_SOURCE_EXPR} AS resolved_source,
         ${RESOLVED_MEDIUM_EXPR} AS resolved_medium,
         COUNT(*) AS event_count
       FROM pixel_events pe
       INNER JOIN (${SESSION_LATEST_SUBQUERY}) latest
         ON pe.session_id = latest.session_id AND CAST(pe.id AS INTEGER) = latest.max_id
       WHERE ${TIME_FILTER_PLACEHOLDER}
       GROUP BY pe.session_id`,
    )
    .bind(cutoff)
    .all<{
      session_id: string;
      resolved_source: string;
      resolved_medium: string;
      event_count: number;
    }>();

  const probabilistic = compareDeterministicVsProbabilistic(
    (sessionRows.results ?? []).map((r) => ({
      session_id: r.session_id,
      resolved_source: r.resolved_source,
      resolved_medium: r.resolved_medium,
      event_count: r.event_count,
    })),
  );

  out.push(
    await insertHamSignal(db, period, {
      signal_key: 'ham_probabilistic_comparison',
      metric_name: 'probabilistic_unknown_share',
      metric_value: probabilistic.probabilistic_unknown_share,
      metric_unit: 'ratio',
      evidence_json: {
        deterministic_unknown_share: probabilistic.deterministic_unknown_share,
        lift_sample_count: probabilistic.lift_rows.length,
        note: 'derived_only_no_raw_mutation',
      },
    }),
  );

  const preview = env ? await fetchMarketingPreview(env, period.period_end) : null;
  if (preview?.google_ads?.topCampaigns?.length) {
    const totalCost = preview.google_ads.topCampaigns.reduce((s, c) => s + (c.cost ?? 0), 0);
    const totalConv = preview.google_ads.topCampaigns.reduce((s, c) => s + (c.conversions ?? 0), 0);
    out.push(
      await insertHamSignal(db, period, {
        signal_key: 'ham_marketing_ads_reconcile',
        metric_name: 'ads_preview_cost',
        metric_value: totalCost,
        metric_unit: 'currency',
        evidence_json: {
          conversions: totalConv,
          campaigns: preview.google_ads.topCampaigns.slice(0, 5),
          cpa_proxy: totalConv > 0 ? totalCost / totalConv : null,
        },
      }),
    );
  }

  return out;
}
