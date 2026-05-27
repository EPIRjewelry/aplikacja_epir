/**
 * HAM Etap C — probabilistyczna warstwa pochodna (bez mutacji raw logs).
 */

export type SessionAttributionRow = {
  session_id: string;
  resolved_source: string;
  resolved_medium: string;
  event_count: number;
};

export type ProbabilisticLiftRow = {
  session_id: string;
  deterministic_source: string;
  suggested_source: string;
  confidence: number;
};

const PAID_MEDIUMS = new Set(['cpc', 'ppc', 'paid', 'paid_social']);

export function suggestProbabilisticSource(row: SessionAttributionRow): ProbabilisticLiftRow | null {
  if (!PAID_MEDIUMS.has(row.resolved_medium) && row.resolved_source !== 'unknown' && row.resolved_source !== 'direct') {
    return null;
  }
  if (row.event_count < 3) return null;

  let suggested = row.resolved_source;
  let confidence = 0.35;

  if (row.resolved_medium === 'cpc' || row.resolved_medium === 'ppc') {
    suggested = 'google';
    confidence = 0.55;
  } else if (row.resolved_source === 'unknown' || row.resolved_source === 'direct') {
    suggested = 'referral';
    confidence = 0.4;
  } else {
    return null;
  }

  if (suggested === row.resolved_source) return null;

  return {
    session_id: row.session_id,
    deterministic_source: row.resolved_source,
    suggested_source: suggested,
    confidence,
  };
}

export function compareDeterministicVsProbabilistic(sessions: SessionAttributionRow[]): {
  deterministic_unknown_share: number;
  probabilistic_unknown_share: number;
  lift_rows: ProbabilisticLiftRow[];
} {
  const total = sessions.length || 1;
  const unknownDet = sessions.filter((s) => s.resolved_source === 'unknown' || s.resolved_source === 'direct').length;
  const lift_rows = sessions.map((s) => suggestProbabilisticSource(s)).filter((r): r is ProbabilisticLiftRow => r !== null);
  const unknownAfter = sessions.filter((s) => {
    const lift = suggestProbabilisticSource(s);
    const src = lift?.suggested_source ?? s.resolved_source;
    return src === 'unknown' || src === 'direct';
  }).length;

  return {
    deterministic_unknown_share: unknownDet / total,
    probabilistic_unknown_share: unknownAfter / total,
    lift_rows,
  };
}
