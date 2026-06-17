/**
 * Eksport sesji operatora na lokalny dysk (PC) przez HTTP bridge — wzorzec Blender bridge.
 */
import type { Env } from '../config/bindings';
import type { OperatorRoleId } from './operator-roles';
import {
  fetchOperatorSessionHistory,
  formatOperatorSessionMarkdown,
} from './operator-session-history';

const EXPORT_ROLE_FOLDER: Record<string, string> = {
  analyst: 'analyst',
  design_blender: 'cad',
  store_ops: 'store_ops',
  creative: 'creative',
};

function exportOrigin(env: Env): string {
  const raw =
    typeof (env as { OPERATOR_EXPORT_ORIGIN?: string }).OPERATOR_EXPORT_ORIGIN === 'string'
      ? (env as { OPERATOR_EXPORT_ORIGIN: string }).OPERATOR_EXPORT_ORIGIN.trim()
      : '';
  return raw.replace(/\/$/, '');
}

export function isOperatorExportConfigured(env: Env): boolean {
  return Boolean(exportOrigin(env));
}

export async function exportOperatorSessionToLocalDisk(
  env: Env,
  sessionId: string,
  role: OperatorRoleId,
): Promise<{ ok: true; path: string } | { ok: false; detail: string }> {
  const origin = exportOrigin(env);
  if (!origin) {
    return {
      ok: false,
      detail:
        'Most eksportu nie skonfigurowany (OPERATOR_EXPORT_ORIGIN). Uruchom scripts/start-operator-export-bridge.ps1 na PC.',
    };
  }

  const sid = sessionId.trim();
  if (!sid) {
    return { ok: false, detail: 'Brak session_id.' };
  }

  let history;
  try {
    history = await fetchOperatorSessionHistory(env, sid);
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e);
    return { ok: false, detail: `Nie udało się odczytać historii: ${msg}` };
  }

  if (history.length === 0) {
    return { ok: false, detail: 'Sesja jest pusta — nic do zapisania.' };
  }

  const markdown = formatOperatorSessionMarkdown(role, sid, history);
  const folder = EXPORT_ROLE_FOLDER[role] ?? role;
  const stamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
  const filename = `${stamp}_${folder}.md`;

  try {
    const r = await fetch(`${origin}/v1/export/markdown`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
      body: JSON.stringify({ role: folder, filename, markdown }),
      signal: AbortSignal.timeout(15_000),
    });
    const text = await r.text();
    let json: { ok?: boolean; path?: string; error?: { message?: string } };
    try {
      json = JSON.parse(text) as typeof json;
    } catch {
      return { ok: false, detail: `Most eksportu: nieprawidłowy JSON (HTTP ${r.status})` };
    }
    if (!r.ok || json.ok !== true) {
      return {
        ok: false,
        detail: json.error?.message ?? `Most eksportu HTTP ${r.status}`,
      };
    }
    return { ok: true, path: json.path ?? `${folder}/${filename}` };
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e);
    return {
      ok: false,
      detail: `Most eksportu offline — uruchom start-operator-export-bridge.ps1 na PC. (${msg.slice(0, 120)})`,
    };
  }
}
