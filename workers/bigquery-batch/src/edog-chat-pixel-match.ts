import { PIXEL_CREATED_AT_MS_SQL } from './d1-timestamps';
import { gemmaCustomerMessagesSql } from './gemma-channel-filter';

export type ChatSessionConsentRow = {
  session_id: string;
  /** D1 `sessions.analytics_consent`: 1 = granted, 0 = denied, null = unknown */
  analytics_consent: number | null;
  /** D1 `sessions.analytics_client_id` — join key to `pixel_events.session_id` when consented */
  analytics_client_id: string | null;
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
 * Pure aggregation: total = all customer sessions; denominator/matched = consented only (analytics_consent=1).
 */
export function aggregateChatPixelSessionMatch(
  rows: ChatSessionConsentRow[],
  matchedPixelClientIds: ReadonlySet<string>,
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
      const clientId = row.analytics_client_id?.trim();
      if (clientId && matchedPixelClientIds.has(clientId)) matched += 1;
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
      `SELECT DISTINCT m.session_id AS session_id,
              s.analytics_consent AS analytics_consent,
              s.analytics_client_id AS analytics_client_id
       FROM messages m
       LEFT JOIN sessions s ON s.session_id = m.session_id
       WHERE CAST(m.timestamp AS INTEGER) >= ?1
         AND m.role = 'user'
         AND ${gemmaCustomerMessagesSql('m')}
       LIMIT 500`,
    )
    .bind(sinceMs)
    .all<{
      session_id: string;
      analytics_consent: number | null;
      analytics_client_id: string | null;
    }>();

  const rows = (sessionsRes.results ?? [])
    .map((r) => ({
      session_id: r.session_id?.trim() ?? '',
      analytics_consent:
        r.analytics_consent === 1 || r.analytics_consent === 0 ? r.analytics_consent : null,
      analytics_client_id:
        typeof r.analytics_client_id === 'string' && r.analytics_client_id.trim()
          ? r.analytics_client_id.trim()
          : null,
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

  const clientIdsForPixel = rows
    .filter((r) => r.analytics_consent === 1 && r.analytics_client_id)
    .map((r) => r.analytics_client_id as string);

  const matchedPixelClientIds = new Set<string>();

  if (clientIdsForPixel.length > 0) {
    const placeholders = clientIdsForPixel.map((_, i) => `?${i + 1}`).join(', ');
    const matched = await pixelDb
      .prepare(
        `SELECT DISTINCT session_id AS session_id FROM pixel_events
         WHERE session_id IN (${placeholders})`,
      )
      .bind(...clientIdsForPixel)
      .all<{ session_id: string }>();
    for (const row of matched.results ?? []) {
      const sid = row.session_id?.trim();
      if (sid) matchedPixelClientIds.add(sid);
    }
  }

  return aggregateChatPixelSessionMatch(rows, matchedPixelClientIds);
}

export async function countPixelNullSessions24h(db: D1Database, sinceMs: number): Promise<{
  total: number;
  nullCount: number;
  rate: number | null;
}> {
  const serverCocreate = `event_type != 'cocreate_form_submitted'`;
  const totalRow = await db
    .prepare(
      `SELECT COUNT(*) AS cnt FROM pixel_events WHERE ${PIXEL_CREATED_AT_MS_SQL} >= ?1 AND ${serverCocreate}`,
    )
    .bind(sinceMs)
    .first<{ cnt: number }>();
  const nullRow = await db
    .prepare(
      `SELECT COUNT(*) AS cnt FROM pixel_events
       WHERE ${PIXEL_CREATED_AT_MS_SQL} >= ?1 AND ${serverCocreate} AND (session_id IS NULL OR TRIM(session_id) = '')`,
    )
    .bind(sinceMs)
    .first<{ cnt: number }>();

  const total = totalRow?.cnt ?? 0;
  const nullCount = nullRow?.cnt ?? 0;
  return {
    total,
    nullCount,
    rate: total > 0 ? nullCount / total : null,
  };
}
