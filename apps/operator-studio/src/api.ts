const API = '/internal/operator-studio/api';

const KEY = 'epir_operator_admin_key';
const SESSION = 'epir_operator_session_id';
const ROLE = 'epir_operator_role';
const OR_MODEL = 'epir_operator_or_model';

export type OperatorRoleId = 'analyst' | 'store_ops' | 'design_blender' | 'creative';

export const ROLES: { id: OperatorRoleId; label: string; hint: string }[] = [
  { id: 'analyst', label: 'Analityk', hint: 'Hurtownia, GA4/Ads, raporty' },
  { id: 'store_ops', label: 'Operacje sklepu', hint: 'Katalog, Admin read, ShopifyQL' },
  { id: 'design_blender', label: 'Blender / CAD', hint: 'Most HTTP, packshot, mesh' },
  { id: 'creative', label: 'Kreacja', hint: 'Pełny katalog OpenRouter' },
];

export function getAdminKey(): string {
  try {
    return sessionStorage.getItem(KEY) ?? '';
  } catch {
    return '';
  }
}

export function setAdminKey(v: string): void {
  sessionStorage.setItem(KEY, v.trim());
}

export function getSessionId(): string | null {
  try {
    return sessionStorage.getItem(SESSION);
  } catch {
    return null;
  }
}

export function setSessionId(id: string): void {
  sessionStorage.setItem(SESSION, id);
}

export function clearSession(): void {
  sessionStorage.removeItem(SESSION);
}

export function getRole(): OperatorRoleId {
  const v = sessionStorage.getItem(ROLE) as OperatorRoleId | null;
  return v && ROLES.some((r) => r.id === v) ? v : 'analyst';
}

export function setRole(r: OperatorRoleId): void {
  sessionStorage.setItem(ROLE, r);
}

export function getOrModel(): string {
  return sessionStorage.getItem(OR_MODEL) ?? '';
}

export function setOrModel(m: string): void {
  sessionStorage.setItem(OR_MODEL, m);
}

function headers(): HeadersInit {
  const h: Record<string, string> = { 'Content-Type': 'application/json' };
  const k = getAdminKey();
  if (k) h['X-Admin-Key'] = k;
  return h;
}

export async function fetchReports(limit = 30) {
  const res = await fetch(`${API}/reports?limit=${limit}`, { headers: headers() });
  if (!res.ok) throw new Error(`reports ${res.status}`);
  return res.json() as Promise<{
    ok: boolean;
    reports: { report_date: string; edog_verdict: string; excerpt: string; created_at: number }[];
  }>;
}

export async function fetchReport(date: string) {
  const res = await fetch(`${API}/reports/${date}`, { headers: headers() });
  if (!res.ok) throw new Error(`report ${res.status}`);
  return res.json() as Promise<{
    ok: boolean;
    report: { report_date: string; markdown_body: string; edog_verdict: string };
  }>;
}

export type OpenRouterCatalogModel = {
  id: string;
  name: string;
  multimodal: boolean;
  imageGen: boolean;
};

export async function fetchOpenRouterModels(): Promise<{ ok: boolean; models: OpenRouterCatalogModel[] }> {
  const res = await fetch(`${API}/openrouter-models`, { headers: headers() });
  const body = (await res.json().catch(() => ({}))) as { ok?: boolean; error?: string; models?: OpenRouterCatalogModel[] };
  if (!res.ok) {
    const detail = body.error?.trim();
    if (res.status === 503 && detail === 'openrouter_not_configured') {
      throw new Error('OPENROUTER_API_KEY nie skonfigurowany na workerze');
    }
    throw new Error(detail || `Katalog OpenRouter: HTTP ${res.status}`);
  }
  if (!body.ok || !Array.isArray(body.models)) {
    throw new Error('Nieprawidłowa odpowiedź katalogu OpenRouter');
  }
  return { ok: true, models: body.models };
}

export async function fetchBlenderHealth() {
  const res = await fetch(`${API}/blender-bridge-health`, { headers: headers() });
  return res.json() as Promise<{ ok: boolean; configured?: boolean; online?: boolean; detail?: string }>;
}

export async function fetchOperatorProfile() {
  const res = await fetch(`${API}/operator-profile`, { headers: headers() });
  if (!res.ok) throw new Error('profile');
  return res.json() as Promise<{ ok: boolean; profile: { brandNotes: string; campaignPriorities?: string } }>;
}

export async function saveOperatorProfile(body: { brandNotes: string; campaignPriorities?: string }) {
  const res = await fetch(`${API}/operator-profile`, {
    method: 'PUT',
    headers: headers(),
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error('save profile');
}

export type ChatMessage = { role: 'user' | 'assistant' | 'error'; content: string };

export async function streamChat(
  message: string,
  opts: { role: OperatorRoleId; orModel: string; imageBase64?: string },
  onDelta: (text: string) => void,
  onImages: (urls: string[]) => void,
): Promise<void> {
  const k = getAdminKey();
  if (!k) throw new Error('Brak klucza operatora');

  const h: Record<string, string> = {
    'Content-Type': 'application/json',
    Accept: 'text/event-stream, application/json',
    'X-Admin-Key': k,
    'X-EPIR-OPERATOR-ROLE': opts.role,
  };
  if (opts.orModel) h['X-Epir-OpenRouter-Model'] = opts.orModel;

  const sid = getSessionId();
  const payload: Record<string, unknown> = { message, stream: true };
  if (sid) payload.session_id = sid;
  if (opts.imageBase64) payload.image_base64 = opts.imageBase64;

  const res = await fetch(`${API}/chat`, {
    method: 'POST',
    headers: h,
    body: JSON.stringify(payload),
  });
  if (!res.ok) throw new Error(await res.text());

  const ct = res.headers.get('content-type') ?? '';
  if (!ct.includes('text/event-stream') || !res.body) {
    const j = await res.json();
    onDelta(JSON.stringify(j, null, 2));
    return;
  }

  const reader = res.body.getReader();
  const dec = new TextDecoder();
  let buf = '';
  let acc = '';

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buf += dec.decode(value, { stream: true });
    const parts = buf.split('\n\n');
    buf = parts.pop() ?? '';
    for (const chunk of parts) {
      for (const line of chunk.split('\n')) {
        if (!line.startsWith('data:')) continue;
        const js = line.slice(5).trim();
        if (!js || js === '[DONE]') continue;
        const o = JSON.parse(js) as {
          delta?: string;
          session_id?: string;
          error?: string;
          images?: { url: string }[];
        };
        if (o.session_id) setSessionId(o.session_id);
        if (o.error) throw new Error(o.error);
        if (o.delta) {
          acc += o.delta;
          onDelta(acc);
        }
        if (o.images?.length) onImages(o.images.map((i) => i.url));
      }
    }
  }
}
