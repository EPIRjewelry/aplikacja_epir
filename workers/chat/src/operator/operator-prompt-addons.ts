/**
 * Składanie addonów promptu dla kanału operator.
 */
import type { Env } from '../config/bindings';
import { getOperatorProfile } from '../internal-operator-copilot';
import { resolveOperatorRoleAddonFromHeaders } from './operator-roles';

const DIGEST_MAX_CHARS = 4000;

export async function resolveOperatorPromptAddons(
  env: Env,
  headers: { get(name: string): string | null },
  sessionId?: string,
): Promise<string> {
  const parts: string[] = [];

  const roleAddon = resolveOperatorRoleAddonFromHeaders(headers);
  if (roleAddon) parts.push(roleAddon);

  const profile = await getOperatorProfile(env);
  if (profile.brandNotes.trim() || profile.campaignPriorities?.trim()) {
    parts.push(
      `Profil operatora (D1): brand_notes=${profile.brandNotes.trim().slice(0, 800)}; campaign_priorities=${(profile.campaignPriorities ?? '').trim().slice(0, 400)}.`,
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
        parts.push(`Streszczenie sesji:\n${dig.digest.trim().slice(0, DIGEST_MAX_CHARS)}`);
      }
    } catch {
      /* table may not exist */
    }
  }

  return parts.join('\n\n');
}
