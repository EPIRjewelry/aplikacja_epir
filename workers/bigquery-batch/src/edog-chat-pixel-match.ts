import { PIXEL_CREATED_AT_MS_SQL } from './d1-timestamps';
import { gemmaCustomerMessagesSql } from './gemma-channel-filter';

export type ChatSessionConsentRow = {
  session_id: string;
  /** D1 `sessions.analytics_consent`: 1 = granted, 0 = denied, null = unknown */
  analytics_consent: number | null;
};

export type ChatPixelMatchStats = {
  chat_sessions_total: number;
  chat_sessions_consented: number;
  chat_sessions_matched: number;
  /** Alias `chat_sessions_total` for legacy consumers */
  chat_sessions_24h: number;
  chat_pixel_session_match_rate: number | null;
};

/**
 * Pure aggregation: denominator = consented only; 0 consented → rate null.
 */
export function aggregateChatPixelSessionMatch(
  rows: ChatSessionConsentRow[],
  matchedSessionIds: ReadonlySet<string>,
): ChatPixelMatchStats {
  const seen = new Set<string>();
  let total = 0;
  let consented = 0;
  let matched = 0;

  for (const row of rows) {
    const sid = row.session_id?.trim();
    if (!sid || seen.has(sid)) continue;
    seen.add(sid);
    total += 1;
    if (row.analytics_consent === 1) {
      consented += 1;
      if (matchedSessionIds.has(sid)) matched += 1;
    }
  }

  const rate = consented > 0 ? matched / consented : null;
  return {
    chat_sessions_total: total,
    chat_sessions_consented: consented,
    chat_sessions_matched: matched,
    chat_sessions_24h: total,
    chat_pixel_session_match_rate: rate,
  };
}

export async function computeChatPixelSessionMatch(
  pixelDb: D1Database,
  chatDb: D1Database,
  sinceMs: number,
): Promise<ChatPixelMatchStats> {
  const sessionsRes = await chatDb
    .prepare(
      `SELECT DISTINCT m.session_id AS session_id, s.analytics_consent AS analytics_consent
       FROM messages m
       LEFT JOIN sessions s ON s.session_id = m.session_id
       WHERE CAST(m.timestamp AS INTEGER) >= ?1
         AND m.role = 'user'
         AND ${gemmaCustomerMessagesSql('m')}
       LIMIT 500`,
    )
    .bind(sinceMs)
    .all<{ session_id: string; analytics_consent: number | null }>();

  const rows = (sessionsRes.results ?? [])
    .map((r) => ({
      session_id: r.session_id?.trim() ?? '',
      analytics_consent:
        r.analytics_consent === 1 || r.analytics_consent === 0 ? r.analytics_consent : null,
    }))
    .filter((r) => r.session_id);

  if (rows.length === 0) {
    return {
      chat_sessions_total: 0,
      chat_sessions_consented: 0,
      chat_sessions_matched: 0,
      chat_sessions_24h: 0,
      chat_pixel_session_match_rate: null,
    };
  }

  const consentedIds = rows.filter((r) => r.analytics_consent === 1).map((r) => r.session_id);
  const matchedSet = new Set<string>();

  if (consentedIds.length > 0) {
    const placeholders = consentedIds.map((_, i) => `?${i + 1}`).join(', ');
    const matched = await pixelDb
      .prepare(
        `SELECT DISTINCT session_id AS session_id FROM pixel_events
         WHERE session_id IN (${placeholders})`,
      )
      .bind(...consentedIds)
      .all<{ session_id: string }>();
    for (const row of matched.results ?? []) {
      const sid = row.session_id?.trim();
      if (sid) matchedSet.add(sid);
    }
  }

  return aggregateChatPixelSessionMatch(rows, matchedSet);
}

export async function countPixelNullSessions24h(db: D1Database, sinceMs: number): Promise<{
  total: number;
  nullCount: number;
  rate: number | null;
}> {
  const totalRow = await db
    .prepare(`SELECT COUNT(*) AS cnt FROM pixel_events WHERE ${PIXEL_CREATED_AT_MS_SQL} >= ?1`)
    .bind(sinceMs)
    .first<{ cnt: number }>();
  const nullRow = await db
    .prepare(
      `SELECT COUNT(*) AS cnt FROM pixel_events
       WHERE ${PIXEL_CREATED_AT_MS_SQL} >= ?1
         AND (session_id IS NULL OR trim(session_id) = '')`,
    )
    .bind(sinceMs)
    .first<{ cnt: number }>();
  const total = totalRow?.cnt ?? -1;
  const nullCount = nullRow?.cnt ?? -1;
  if (total < 0 || nullCount < 0) return { total, nullCount, rate: null };
  if (total === 0) return { total: 0, nullCount: 0, rate: null };
  return { total, nullCount, rate: nullCount / total };
}
