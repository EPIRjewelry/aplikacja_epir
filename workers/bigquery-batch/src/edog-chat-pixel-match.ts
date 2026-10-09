import { PIXEL_CREATED_AT_MS_SQL } from './d1-timestamps';
import { gemmaCustomerMessagesSql } from './gemma-channel-filter';

export type ChatPixelMatchStats = {
  chat_sessions_24h: number;
  chat_pixel_session_match_rate: number | null;
};

export async function computeChatPixelSessionMatch(
  pixelDb: D1Database,
  chatDb: D1Database,
  sinceMs: number,
): Promise<ChatPixelMatchStats> {
  const sessionsRes = await chatDb
    .prepare(
      `SELECT DISTINCT m.session_id AS session_id FROM messages m
       WHERE CAST(m.timestamp AS INTEGER) >= ?1
         AND m.role = 'user'
         AND ${gemmaCustomerMessagesSql('m')}
       LIMIT 500`,
    )
    .bind(sinceMs)
    .all<{ session_id: string }>();

  const sessionIds = (sessionsRes.results ?? [])
    .map((r) => r.session_id?.trim())
    .filter(Boolean) as string[];

  if (sessionIds.length === 0) {
    return { chat_sessions_24h: 0, chat_pixel_session_match_rate: null };
  }

  const placeholders = sessionIds.map((_, i) => `?${i + 1}`).join(', ');
  const matched = await pixelDb
    .prepare(
      `SELECT COUNT(DISTINCT session_id) AS cnt FROM pixel_events
       WHERE session_id IN (${placeholders})`,
    )
    .bind(...sessionIds)
    .first<{ cnt: number }>();

  const matchedCount = matched?.cnt ?? 0;
  return {
    chat_sessions_24h: sessionIds.length,
    chat_pixel_session_match_rate: matchedCount / sessionIds.length,
  };
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
