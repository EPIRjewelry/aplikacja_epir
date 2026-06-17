/**
 * Odczyt historii sesji operatora z SessionDO (UI + eksport na dysk).
 */
import type { Env } from '../config/bindings';

export type OperatorHistoryEntry = { role: 'user' | 'assistant'; content: string };

function getSessionDOStub(env: Env, sessionId: string) {
  const id = env.SESSION_DO.idFromName(sessionId);
  return env.SESSION_DO.get(id);
}

function normalizeHistory(raw: unknown): OperatorHistoryEntry[] {
  if (!Array.isArray(raw)) return [];
  return raw
    .filter((entry) => typeof entry === 'object' && entry !== null)
    .map((entry) => entry as { role?: string; content?: string })
    .filter((entry) => entry.role === 'user' || entry.role === 'assistant')
    .map((entry) => ({
      role: entry.role as 'user' | 'assistant',
      content: typeof entry.content === 'string' ? entry.content.trim() : '',
    }))
    .filter((entry) => entry.content.length > 0);
}

export async function fetchOperatorSessionHistory(
  env: Env,
  sessionId: string,
): Promise<OperatorHistoryEntry[]> {
  const sid = sessionId.trim();
  if (!sid) return [];
  const stub = getSessionDOStub(env, sid);
  const historyResp = await stub.fetch('https://session/history');
  if (!historyResp.ok) {
    throw new Error(`Session history returned ${historyResp.status}`);
  }
  const historyRaw = await historyResp.json().catch(() => []);
  return normalizeHistory(historyRaw);
}

export function formatOperatorSessionMarkdown(
  role: string,
  sessionId: string,
  history: OperatorHistoryEntry[],
): string {
  const roleLabel =
    role === 'design_blender' ? 'Blender / CAD' : role === 'analyst' ? 'Analityk' : role;
  const lines = [
    `# Operator Studio — ${roleLabel}`,
    '',
    `- Session: \`${sessionId}\``,
    `- Exported: ${new Date().toISOString()}`,
    `- Messages: ${history.length}`,
    '',
  ];
  for (const m of history) {
    const heading = m.role === 'user' ? '## Ty' : '## Asystent';
    lines.push(heading, '', m.content, '');
  }
  return lines.join('\n').trimEnd() + '\n';
}
