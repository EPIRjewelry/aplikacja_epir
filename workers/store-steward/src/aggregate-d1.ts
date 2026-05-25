import type { AnalysisPeriod } from './period';
import { newId } from './period';
import type { StoreSignal } from '@epir/steward-contract';

/** Filtr czasu — runtime pixel_events używa INTEGER ms lub TEXT ISO. */
const TIME_FILTER = `(typeof(created_at) = 'integer' AND created_at >= ?1)
  OR (typeof(created_at) = 'text' AND created_at >= datetime(?1 / 1000.0, 'unixepoch'))`;

type SignalRow = {
  signal_key: string;
  storefront_id: string | null;
  channel: string | null;
  product_handle: string | null;
  product_id: string | null;
  metric_name: string;
  metric_value: number;
  metric_unit: string | null;
  evidence_json: string | null;
};

async function insertSignal(
  db: D1Database,
  period: AnalysisPeriod,
  row: SignalRow,
): Promise<StoreSignal> {
  const id = newId('sig');
  await db
    .prepare(
      `INSERT INTO store_signals (
        id, period_start, period_end, signal_key, storefront_id, channel,
        product_handle, product_id, metric_name, metric_value, metric_unit, evidence_json, source
      ) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12, 'd1_pixel')
      ON CONFLICT(id) DO NOTHING`,
    )
    .bind(
      id,
      period.period_start,
      period.period_end,
      row.signal_key,
      row.storefront_id,
      row.channel,
      row.product_handle,
      row.product_id,
      row.metric_name,
      row.metric_value,
      row.metric_unit,
      row.evidence_json,
    )
    .run();
  return {
    id,
    period_start: period.period_start,
    period_end: period.period_end,
    signal_key: row.signal_key,
    storefront_id: row.storefront_id,
    channel: row.channel,
    product_handle: row.product_handle,
    product_id: row.product_id,
    metric_name: row.metric_name,
    metric_value: row.metric_value,
    metric_unit: row.metric_unit,
    evidence_json: row.evidence_json,
    source: 'd1_pixel',
  };
}

export async function aggregatePixelSignals(db: D1Database, period: AnalysisPeriod): Promise<StoreSignal[]> {
  const out: StoreSignal[] = [];
  const cutoff = period.cutoff_ms;

  // Q2-like funnel (global)
  const funnel = await db
    .prepare(
      `SELECT event_type, COUNT(*) AS event_count, COUNT(DISTINCT session_id) AS unique_sessions
       FROM pixel_events
       WHERE ${TIME_FILTER}
       GROUP BY event_type`,
    )
    .bind(cutoff)
    .all<{ event_type: string; event_count: number; unique_sessions: number }>();

  for (const row of funnel.results ?? []) {
    out.push(
      await insertSignal(db, period, {
        signal_key: 'funnel_global',
        storefront_id: null,
        channel: null,
        product_handle: null,
        product_id: null,
        metric_name: `events_${row.event_type}`,
        metric_value: row.event_count,
        metric_unit: 'count',
        evidence_json: JSON.stringify({ unique_sessions: row.unique_sessions }),
      }),
    );
  }

  // PDP → ATC drop proxy per product_handle
  const productFunnel = await db
    .prepare(
      `SELECT
         COALESCE(product_handle, product_id, 'unknown') AS ph,
         product_id,
         SUM(CASE WHEN event_type = 'product_viewed' THEN 1 ELSE 0 END) AS views,
         SUM(CASE WHEN event_type = 'product_added_to_cart' THEN 1 ELSE 0 END) AS atc,
         SUM(CASE WHEN event_type = 'checkout_started' THEN 1 ELSE 0 END) AS checkout_started,
         AVG(scroll_depth_percent) AS avg_scroll,
         AVG(time_on_page_seconds) AS avg_time_sec
       FROM pixel_events
       WHERE ${TIME_FILTER}
       GROUP BY ph, product_id
       HAVING views >= 5
       ORDER BY views DESC
       LIMIT 30`,
    )
    .bind(cutoff)
    .all<{
      ph: string;
      product_id: string | null;
      views: number;
      atc: number;
      checkout_started: number;
      avg_scroll: number | null;
      avg_time_sec: number | null;
    }>();

  for (const row of productFunnel.results ?? []) {
    const atcRate = row.views > 0 ? row.atc / row.views : 0;
    out.push(
      await insertSignal(db, period, {
        signal_key: `product_${row.ph}`,
        storefront_id: null,
        channel: null,
        product_handle: row.ph,
        product_id: row.product_id,
        metric_name: 'view_to_atc_rate',
        metric_value: atcRate,
        metric_unit: 'ratio',
        evidence_json: JSON.stringify({
          views: row.views,
          atc: row.atc,
          checkout_started: row.checkout_started,
          avg_scroll: row.avg_scroll,
          avg_time_sec: row.avg_time_sec,
        }),
      }),
    );
  }

  // Per channel / storefront
  const byChannel = await db
    .prepare(
      `SELECT COALESCE(channel, 'unknown') AS ch, COALESCE(storefront_id, 'unknown') AS sf,
              COUNT(*) AS events, COUNT(DISTINCT session_id) AS sessions
       FROM pixel_events
       WHERE ${TIME_FILTER}
       GROUP BY ch, sf`,
    )
    .bind(cutoff)
    .all<{ ch: string; sf: string; events: number; sessions: number }>();

  for (const row of byChannel.results ?? []) {
    out.push(
      await insertSignal(db, period, {
        signal_key: `channel_${row.ch}`,
        storefront_id: row.sf,
        channel: row.ch,
        product_handle: null,
        product_id: null,
        metric_name: 'session_count',
        metric_value: row.sessions,
        metric_unit: 'count',
        evidence_json: JSON.stringify({ events: row.events }),
      }),
    );
  }

  // Abandoned checkout signal
  const checkoutDrop = await db
    .prepare(
      `SELECT
         SUM(CASE WHEN event_type = 'checkout_started' THEN 1 ELSE 0 END) AS started,
         SUM(CASE WHEN event_type = 'purchase_completed' THEN 1 ELSE 0 END) AS completed
       FROM pixel_events
       WHERE ${TIME_FILTER}`,
    )
    .bind(cutoff)
    .first<{ started: number; completed: number }>();

  if (checkoutDrop) {
    const started = checkoutDrop.started ?? 0;
    const completed = checkoutDrop.completed ?? 0;
    const drop = started > 0 ? (started - completed) / started : 0;
    out.push(
      await insertSignal(db, period, {
        signal_key: 'checkout_global',
        storefront_id: null,
        channel: null,
        product_handle: null,
        product_id: null,
        metric_name: 'checkout_abandon_rate',
        metric_value: drop,
        metric_unit: 'ratio',
        evidence_json: JSON.stringify({ checkout_started: started, purchase_completed: completed }),
      }),
    );
  }

  return out;
}
