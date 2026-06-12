import type { BuiltMessagePayload } from './attachments';
import type { GroqModelVariantKey } from './groq-models';

const API = '/internal/operator-studio/api';

const KEY = 'epir_operator_admin_key';
/** Legacy solo-dev-chat v1 — migrated once into KEY on read */
const LEGACY_KEY = 'epir_solo_dev_chat_admin_key';
const SESSION = 'epir_operator_session_id';
const ROLE = 'epir_operator_role';
const OR_MODEL = 'epir_operator_or_model';
const MODEL_SOURCE = 'epir_operator_model_source';
const GROQ_VARIANT = 'epir_operator_groq_variant';

export type ModelSource = 'groq' | 'openrouter';

export type OperatorRoleId = 'analyst' | 'store_ops' | 'design_blender' | 'creative';

export const ROLES: { id: OperatorRoleId; label: string; hint: string }[] = [
  { id: 'analyst', label: 'Analityk', hint: 'Hurtownia, GA4/Ads, raporty' },
  { id: 'store_ops', label: 'Operacje sklepu', hint: 'Katalog, Admin read, ShopifyQL' },
  { id: 'design_blender', label: 'Blender / CAD', hint: 'Most HTTP, packshot, mesh' },
  { id: 'creative', label: 'Kreacja', hint: 'Pełny katalog OpenRouter' },
];

export function getAdminKey(): string {
  try {
    const current = sessionStorage.getItem(KEY)?.trim() ?? '';
    if (current) return current;
    const legacy = sessionStorage.getItem(LEGACY_KEY)?.trim() ?? '';
    if (legacy) {
      sessionStorage.setItem(KEY, legacy);
      return legacy;
    }
    return '';
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

export function getModelSource(): ModelSource {
  const v = sessionStorage.getItem(MODEL_SOURCE);
  return v === 'openrouter' ? 'openrouter' : 'groq';
}

export function setModelSource(s: ModelSource): void {
  sessionStorage.setItem(MODEL_SOURCE, s);
}

export function getGroqVariant(): GroqModelVariantKey {
  const v = sessionStorage.getItem(GROQ_VARIANT) as GroqModelVariantKey | null;
  const allowed = ['', 'kimi_k25', 'k26', 'glm_flash', 'qwen3_30b_a3b', 'gemma4_26b', 'scout_17b'] as const;
  return v && (allowed as readonly string[]).includes(v) ? v : '';
}

export function setGroqVariant(k: GroqModelVariantKey): void {
  sessionStorage.setItem(GROQ_VARIANT, k);
}

function headers(adminKey?: string): HeadersInit {
  const h: Record<string, string> = { 'Content-Type': 'application/json' };
  const k = (adminKey ?? getAdminKey()).trim();
  if (k) h['X-Admin-Key'] = k;
  return h;
}

export async function fetchReports(limit = 30, adminKey?: string) {
  const res = await fetch(`${API}/reports?limit=${limit}`, { headers: headers(adminKey) });
  const body = (await res.json().catch(() => ({}))) as {
    ok?: boolean;
    error?: string;
    detail?: string;
    reports?: { report_date: string; edog_verdict: string; excerpt: string; created_at: number }[];
  };
  if (!res.ok) {
    throw new Error(body.detail || body.error || `reports ${res.status}`);
  }
  return {
    ok: Boolean(body.ok),
    reports: body.reports ?? [],
    error: body.error,
    detail: body.detail,
  };
}

export async function fetchLatestOperatorReport(adminKey?: string) {
  const res = await fetch(`${API}/operator-report/latest`, { headers: headers(adminKey) });
  const body = (await res.json().catch(() => ({}))) as {
    ok?: boolean;
    report?: {
      report_date: string;
      markdown_body: string;
      edog_verdict: string;
      created_at: number;
    } | null;
    error?: string;
  };
  if (!res.ok) {
    throw new Error(body.error || `latest-report ${res.status}`);
  }
  return { ok: Boolean(body.ok), report: body.report ?? null };
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
  built: BuiltMessagePayload,
  opts: {
    role: OperatorRoleId;
    modelSource: ModelSource;
    orModel: string;
    groqVariant: GroqModelVariantKey;
  },
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
  if (opts.modelSource === 'openrouter' && opts.orModel.trim()) {
    h['X-Epir-OpenRouter-Model'] = opts.orModel.trim();
  }
  if (opts.modelSource === 'groq' && opts.groqVariant) {
    h['X-Epir-Model-Variant'] = opts.groqVariant;
  }

  const sid = getSessionId();
  const payload: Record<string, unknown> = { message: built.message, stream: true };
  if (sid) payload.session_id = sid;
  if (built.imageBase64) payload.image_base64 = built.imageBase64;
  if (built.parts?.length) payload.parts = built.parts;

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
