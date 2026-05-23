/**
 * EDOG — logika werdyktu operacyjnego przepływu danych (bez I/O).
 * @see docs/merge-gates/EDOG_IMPLEMENTATION_STEPS.md
 */

export type EdogVerdict = 'PASS' | 'FAIL' | 'DEGRADED';

export type FlowHealthSnapshot = {
  pending_pixel_events: number;
  batch_exports: {
    last_pixel_export_at: number;
    last_messages_export_at: number;
    updated_at: number;
  } | null;
  pipeline_pixel_configured: boolean;
  pipeline_messages_configured: boolean;
  d1_pixel_events_24h: number;
  d1_messages_24h: number;
  warehouse_q1_ok: boolean;
  warehouse_q1_row_count: number | null;
  warehouse_q1_skipped: boolean;
  warehouse_q1_error?: string;
  checked_at: string;
};

export type FlowHealthInput = {
  pending_pixel_events: number;
  batch_exports_updated_at_ms: number;
  now_ms: number;
  pipeline_pixel_configured: boolean;
  pipeline_messages_configured: boolean;
  d1_pixel_events_24h: number;
  d1_messages_24h: number;
  warehouse_q1_row_count: number | null;
  warehouse_q1_skipped: boolean;
  warehouse_q1_error?: string;
};

const MS_24H = 24 * 60 * 60 * 1000;
const PENDING_FAIL = 10_000;
const PENDING_DEGRADED = 1_000;
const BATCH_STALE_FAIL_H = 48;
const BATCH_STALE_DEGRADED_H = 26;

export function computeEdogVerdict(input: FlowHealthInput): { verdict: EdogVerdict; reasons: string[] } {
  const reasons: string[] = [];
  let fail = false;
  let degraded = false;

  if (!input.pipeline_pixel_configured) {
    reasons.push('pipeline_pixel_not_configured');
    fail = true;
  }

  if (input.pending_pixel_events < 0) {
    reasons.push('batch_exports_or_pending_unavailable');
    fail = true;
  } else if (input.pending_pixel_events >= PENDING_FAIL) {
    reasons.push(`pending_pixel_events_critical:${input.pending_pixel_events}`);
    fail = true;
  } else if (input.pending_pixel_events >= PENDING_DEGRADED) {
    reasons.push(`pending_pixel_events_elevated:${input.pending_pixel_events}`);
    degraded = true;
  }

  const batchAgeH =
    input.batch_exports_updated_at_ms > 0
      ? (input.now_ms - input.batch_exports_updated_at_ms) / 3_600_000
      : Number.POSITIVE_INFINITY;

  if (input.batch_exports_updated_at_ms <= 0) {
    reasons.push('batch_exports_never_updated');
    fail = true;
  } else if (batchAgeH >= BATCH_STALE_FAIL_H) {
    reasons.push(`batch_exports_stale_hours:${batchAgeH.toFixed(1)}`);
    fail = true;
  } else if (batchAgeH >= BATCH_STALE_DEGRADED_H) {
    reasons.push(`batch_exports_lag_hours:${batchAgeH.toFixed(1)}`);
    degraded = true;
  }

  if (input.d1_pixel_events_24h === 0 && input.pending_pixel_events === 0 && !fail) {
    reasons.push('no_pixel_events_24h');
    degraded = true;
  }

  if (!fail && !input.warehouse_q1_skipped) {
    if (input.warehouse_q1_error) {
      reasons.push(`warehouse_q1_error:${input.warehouse_q1_error.slice(0, 120)}`);
      fail = true;
    } else if (input.warehouse_q1_row_count === 0) {
      reasons.push('warehouse_q1_empty');
      degraded = true;
    }
  } else if (!fail && input.warehouse_q1_skipped && input.pipeline_pixel_configured) {
    reasons.push('warehouse_q1_skipped_batch_unhealthy');
  }

  if (fail) return { verdict: 'FAIL', reasons };
  if (degraded) return { verdict: 'DEGRADED', reasons };
  return { verdict: 'PASS', reasons: reasons.length ? reasons : ['ok'] };
}

/** Czy wolno wykonać kosztowną sondę R2 SQL (Q1) w tym przebiegu. */
export function shouldProbeWarehouseQ1(input: FlowHealthInput): boolean {
  if (!input.pipeline_pixel_configured) return false;
  if (input.pending_pixel_events < 0) return false;
  if (input.pending_pixel_events >= PENDING_FAIL) return false;
  if (input.batch_exports_updated_at_ms <= 0) return false;
  const batchAgeH = (input.now_ms - input.batch_exports_updated_at_ms) / 3_600_000;
  if (batchAgeH >= BATCH_STALE_FAIL_H) return false;
  return true;
}

export function since24hMs(nowMs: number): number {
  return nowMs - MS_24H;
}
