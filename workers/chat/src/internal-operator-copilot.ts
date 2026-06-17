/**
 * Project B — profil operatora (D1), digest sesji, odczyt raportów dziennych.
 */
import type { Env } from './config/bindings';
import type { OperatorProfileV1 } from './operator/operator-profile';
import { DEFAULT_OPERATOR_PROFILE } from './operator/operator-profile';

const DIGEST_EVERY_N_MESSAGES = 6;
const DIGEST_MAX_CHARS = 4000;

export type OperatorProfileRow = OperatorProfileV1 & {
  campaignPriorities?: string;
};

export async function getOperatorProfile(env: Env, operatorId = 'default'): Promise<OperatorProfileRow> {
  try {
    const row = await env.DB_CHATBOT.prepare(
      `SELECT brand_notes, campaign_priorities FROM internal_operator_profile WHERE operator_id = ?1`,
    )
      .bind(operatorId)
      .first<{
        brand_notes: string;
        campaign_priorities: string | null;
      }>();
    if (!row) return { ...DEFAULT_OPERATOR_PROFILE, campaignPriorities: '' };
    return {
      brandNotes: row.brand_notes ?? '',
      campaignPriorities: row.campaign_priorities ?? '',
    };
  } catch {
    return { ...DEFAULT_OPERATOR_PROFILE, campaignPriorities: '' };
  }
}

export async function putOperatorProfile(
  env: Env,
  profile: OperatorProfileRow,
  operatorId = 'default',
): Promise<void> {
  const now = Date.now();
  await env.DB_CHATBOT.prepare(
    `INSERT INTO internal_operator_profile (operator_id, brand_notes, default_workflow_id, campaign_priorities, updated_at)
     VALUES (?1, ?2, ?3, ?4, ?5)
     ON CONFLICT(operator_id) DO UPDATE SET
       brand_notes = excluded.brand_notes,
       campaign_priorities = excluded.campaign_priorities,
       updated_at = excluded.updated_at`,
  )
    .bind(
      operatorId,
      profile.brandNotes ?? '',
      'data_warehouse',
      profile.campaignPriorities ?? null,
      now,
    )
    .run();
}

export async function getLatestOperatorReport(env: Env): Promise<{
  report_date: string;
  markdown_body: string;
  edog_verdict: string;
  created_at: number;
} | null> {
  try {
    return await env.DB_CHATBOT.prepare(
      `SELECT report_date, markdown_body, edog_verdict, created_at FROM operator_daily_reports ORDER BY created_at DESC LIMIT 1`,
    ).first();
  } catch {
    return null;
  }
}

export type OperatorReportListItem = {
  report_date: string;
  edog_verdict: string;
  created_at: number;
  excerpt: string;
};

export async function listOperatorReports(env: Env, limit = 30): Promise<OperatorReportListItem[]> {
  const cap = Math.min(Math.max(limit, 1), 100);
  if (!env.DB_CHATBOT) {
    throw new Error('DB_CHATBOT not configured');
  }
  const rows = await env.DB_CHATBOT.prepare(
    `SELECT report_date, markdown_body, edog_verdict, created_at
     FROM operator_daily_reports ORDER BY created_at DESC LIMIT ?1`,
  )
    .bind(cap)
    .all<{
      report_date: string;
      markdown_body: string;
      edog_verdict: string;
      created_at: number;
    }>();
  return (rows.results ?? []).map((r) => ({
    report_date: r.report_date,
    edog_verdict: r.edog_verdict,
    created_at: r.created_at,
    excerpt: (r.markdown_body ?? '').replace(/\s+/g, ' ').trim().slice(0, 200),
  }));
}

export async function getOperatorReportByDate(
  env: Env,
  reportDate: string,
): Promise<{
  report_date: string;
  markdown_body: string;
  edog_verdict: string;
  created_at: number;
} | null> {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(reportDate)) return null;
  try {
    return await env.DB_CHATBOT.prepare(
      `SELECT report_date, markdown_body, edog_verdict, created_at FROM operator_daily_reports WHERE report_date = ?1`,
    )
      .bind(reportDate)
      .first();
  } catch {
    return null;
  }
}

export async function maybeRefreshSessionDigest(env: Env, sessionId: string): Promise<void> {
  if (!sessionId?.trim()) return;
  try {
    const countRow = await env.DB_CHATBOT.prepare(
      `SELECT COUNT(*) AS cnt FROM messages WHERE session_id = ?1`,
    )
      .bind(sessionId)
      .first<{ cnt: number }>();
    const cnt = countRow?.cnt ?? 0;
    if (cnt === 0 || cnt % DIGEST_EVERY_N_MESSAGES !== 0) return;

    const rows = await env.DB_CHATBOT.prepare(
      `SELECT role, content, timestamp FROM messages WHERE session_id = ?1 ORDER BY timestamp DESC LIMIT 24`,
    )
      .bind(sessionId)
      .all<{ role: string; content: string; timestamp: number }>();

    const lines = (rows.results ?? [])
      .reverse()
      .map((m) => {
        const text = (m.content ?? '').replace(/\s+/g, ' ').trim().slice(0, 280);
        return `- [${m.role}] ${text}`;
      })
      .join('\n');

    const digest = `Sesja ${sessionId} (${cnt} wiadomości, skrót ostatnich tur):\n${lines}`.slice(0, DIGEST_MAX_CHARS);
    const now = Date.now();
    await env.DB_CHATBOT.prepare(
      `INSERT INTO internal_session_digest (session_id, digest, message_count, updated_at)
       VALUES (?1, ?2, ?3, ?4)
       ON CONFLICT(session_id) DO UPDATE SET digest = excluded.digest, message_count = excluded.message_count, updated_at = excluded.updated_at`,
    )
      .bind(sessionId, digest, cnt, now)
      .run();
  } catch (e) {
    console.warn('[operator-copilot] digest refresh failed:', e);
  }
}
