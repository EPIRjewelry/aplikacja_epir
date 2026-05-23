/**
 * Project B — profil operatora (D1), digest sesji, odczyt raportów dziennych.
 */
import type { Env } from './config/bindings';
import { resolveSoloDevAgentAddonFromHeaders } from './solo-dev-agent-presets';
import type { OperatorProfileV1 } from './solo-dev-ui/operator-profile';
import { DEFAULT_OPERATOR_PROFILE } from './solo-dev-ui/operator-profile';

const DIGEST_EVERY_N_MESSAGES = 6;
const DIGEST_MAX_CHARS = 4000;

export type OperatorProfileRow = OperatorProfileV1 & {
  campaignPriorities?: string;
};

export async function getOperatorProfile(env: Env, operatorId = 'default'): Promise<OperatorProfileRow> {
  try {
    const row = await env.DB_CHATBOT.prepare(
      `SELECT brand_notes, default_workflow_id, campaign_priorities FROM internal_operator_profile WHERE operator_id = ?1`,
    )
      .bind(operatorId)
      .first<{
        brand_notes: string;
        default_workflow_id: string;
        campaign_priorities: string | null;
      }>();
    if (!row) return { ...DEFAULT_OPERATOR_PROFILE, campaignPriorities: '' };
    return {
      brandNotes: row.brand_notes ?? '',
      defaultWorkflowId: row.default_workflow_id ?? 'data_warehouse',
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
       default_workflow_id = excluded.default_workflow_id,
       campaign_priorities = excluded.campaign_priorities,
       updated_at = excluded.updated_at`,
  )
    .bind(
      operatorId,
      profile.brandNotes ?? '',
      profile.defaultWorkflowId ?? 'data_warehouse',
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

export async function resolveInternalDashboardPromptAddons(
  env: Env,
  headers: { get(name: string): string | null },
  sessionId?: string,
): Promise<string> {
  const parts: string[] = [];
  const agentAddon = resolveSoloDevAgentAddonFromHeaders(headers, env);
  if (agentAddon) parts.push(agentAddon);

  const profile = await getOperatorProfile(env);
  if (profile.brandNotes.trim() || profile.campaignPriorities?.trim()) {
    parts.push(
      `Profil operatora (D1): brand_notes=${profile.brandNotes.trim().slice(0, 800)}; campaign_priorities=${(profile.campaignPriorities ?? '').trim().slice(0, 400)}; default_workflow=${profile.defaultWorkflowId}.`,
    );
  }

  if (sessionId) {
    try {
      const dig = await env.DB_CHATBOT.prepare(
        `SELECT digest FROM internal_session_digest WHERE session_id = ?1`,
      )
        .bind(sessionId)
        .first<{ digest: string }>();
      if (dig?.digest?.trim()) {
        parts.push(`Streszczenie bieżącej sesji (digest):\n${dig.digest.trim().slice(0, DIGEST_MAX_CHARS)}`);
      }
    } catch {
      /* table may not exist yet */
    }
  }

  return parts.join('\n\n');
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
