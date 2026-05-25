import type { StewardBarrier, StewardInsight, StoreSignal } from '@epir/steward-contract';
import type { AnalysisPeriod } from './period';
import { newId } from './period';

type InsightDraft = {
  barrier: StewardBarrier | null;
  metric: string;
  baseline: number | null;
  delta: number | null;
  confidence: number;
  summary: string;
  evidence: Record<string, unknown>;
};

function findSignal(signals: StoreSignal[], metricName: string, signalKey?: string): StoreSignal | undefined {
  return signals.find(
    (s) => s.metric_name === metricName && (signalKey == null || s.signal_key === signalKey),
  );
}

function findProductSignals(signals: StoreSignal[]): StoreSignal[] {
  return signals.filter((s) => s.metric_name === 'view_to_atc_rate' && s.signal_key.startsWith('product_'));
}

export function deriveInsights(period: AnalysisPeriod, signals: StoreSignal[]): InsightDraft[] {
  const drafts: InsightDraft[] = [];

  const checkout = findSignal(signals, 'checkout_abandon_rate', 'checkout_global');
  if (checkout && checkout.metric_value >= 0.5) {
    drafts.push({
      barrier: 'CZAS',
      metric: 'checkout_abandon_rate',
      baseline: null,
      delta: checkout.metric_value,
      confidence: 0.7,
      summary: `Wysoki wskaźnik porzuceń checkout (${(checkout.metric_value * 100).toFixed(0)}%) w okresie ${period.period_start}–${period.period_end}.`,
      evidence: { signal_id: checkout.id, metric_value: checkout.metric_value },
    });
  }

  const products = findProductSignals(signals).sort((a, b) => a.metric_value - b.metric_value);
  const weakest = products[0];
  if (weakest && weakest.metric_value < 0.08) {
    let evidence: Record<string, unknown> = { product_handle: weakest.product_handle, atc_rate: weakest.metric_value };
    try {
      if (weakest.evidence_json) evidence = { ...evidence, ...JSON.parse(weakest.evidence_json) };
    } catch {
      /* ignore */
    }
    const avgScroll = typeof evidence.avg_scroll === 'number' ? evidence.avg_scroll : null;
    const barrier: StewardBarrier = avgScroll != null && avgScroll > 60 ? 'ROZMIAR' : 'BRAK_INFO';
    drafts.push({
      barrier,
      metric: 'view_to_atc_rate',
      baseline: 0.15,
      delta: weakest.metric_value - 0.15,
      confidence: 0.65,
      summary: `Produkt ${weakest.product_handle ?? weakest.product_id ?? 'unknown'}: dużo odsłon, słaba konwersja do koszyka (${(weakest.metric_value * 100).toFixed(1)}% ATC/view).`,
      evidence,
    });
  }

  const channelSessions = signals.filter((s) => s.metric_name === 'session_count' && s.channel);
  if (channelSessions.length >= 2) {
    const sorted = [...channelSessions].sort((a, b) => b.metric_value - a.metric_value);
    const top = sorted[0];
    const second = sorted[1];
    if (top.metric_value > second.metric_value * 1.5) {
      drafts.push({
        barrier: null,
        metric: 'channel_concentration',
        baseline: second.metric_value,
        delta: top.metric_value - second.metric_value,
        confidence: 0.55,
        summary: `Ruch koncentruje się na kanale ${top.channel} (${top.metric_value} sesji vs ${second.channel} ${second.metric_value}).`,
        evidence: { top_channel: top.channel, top_sessions: top.metric_value, second_channel: second.channel },
      });
    }
  }

  const warehouseQ7 = signals.find((s) => s.signal_key === 'warehouse_Q7_PRODUCT_TO_PURCHASE');
  if (warehouseQ7?.evidence_json) {
    try {
      const sample = JSON.parse(warehouseQ7.evidence_json) as { sample?: Record<string, unknown>[] };
      const first = sample.sample?.[0];
      if (first && typeof first.conversion_rate_pct === 'number' && first.conversion_rate_pct < 5) {
        drafts.push({
          barrier: 'CENA',
          metric: 'warehouse_view_to_purchase',
          baseline: null,
          delta: first.conversion_rate_pct,
          confidence: 0.6,
          summary: `Hurtownia R2 SQL: niska konwersja view→purchase (${first.conversion_rate_pct}%) — warto przejrzeć cenę i zaufanie marki na PDP.`,
          evidence: { warehouse_row: first },
        });
      }
    } catch {
      /* ignore */
    }
  }

  if (drafts.length === 0) {
    drafts.push({
      barrier: null,
      metric: 'store_health',
      baseline: null,
      delta: null,
      confidence: 0.4,
      summary: `Brak silnych anomalii w okresie ${period.period_start}–${period.period_end}; kontynuuj obserwację.`,
      evidence: { signal_count: signals.length },
    });
  }

  return drafts;
}

export async function persistInsights(
  db: D1Database,
  period: AnalysisPeriod,
  drafts: InsightDraft[],
): Promise<StewardInsight[]> {
  const saved: StewardInsight[] = [];
  for (const d of drafts) {
    const id = newId('ins');
    const evidence_json = JSON.stringify(d.evidence);
    await db
      .prepare(
        `INSERT INTO steward_insights (
          id, period_start, period_end, barrier, metric, baseline, delta,
          confidence, summary, evidence_json, status
        ) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, 'open')`,
      )
      .bind(
        id,
        period.period_start,
        period.period_end,
        d.barrier,
        d.metric,
        d.baseline,
        d.delta,
        d.confidence,
        d.summary,
        evidence_json,
      )
      .run();
    saved.push({
      id,
      period_start: period.period_start,
      period_end: period.period_end,
      barrier: d.barrier,
      metric: d.metric,
      baseline: d.baseline,
      delta: d.delta,
      confidence: d.confidence,
      summary: d.summary,
      evidence_json,
      status: 'open',
    });
  }
  return saved;
}
