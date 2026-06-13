/**
 * Maskowanie PII przed eksportem raportu do Google Workspace (webhook).
 * SSOT w D1 pozostaje bez zmian — tylko payload zewnętrzny.
 *
 * Normalizacja zgodna z Google Customer Match przed SHA-256.
 */

const PII_FIELD_KEYS = new Set(
  [
    'customer_id',
    'customerid',
    'user_id',
    'userid',
    'email',
    'e_mail',
    'phone',
    'mobile',
    'tel',
    'ip',
    'ip_address',
    'first_name',
    'lastname',
    'last_name',
    'full_name',
    'name',
    'address',
    'street',
    'postal',
    'zip',
    'city',
    'session_id',
    'anonymous_id',
    'client_id',
  ].map((k) => k.toLowerCase()),
);

const EMAIL_FIELD_KEYS = new Set(['email', 'e_mail']);
const PHONE_FIELD_KEYS = new Set(['phone', 'mobile', 'tel']);

const GMAIL_DOMAINS = new Set(['gmail.com', 'googlemail.com']);

const EMAIL_RE = /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g;
const PHONE_RE = /(?:\+?\d{1,3}[-.\s]?)?\(?\d{2,4}\)?[-.\s]?\d{3,4}[-.\s]?\d{3,4}/g;

export async function sha256Hex(input: string): Promise<string> {
  const data = new TextEncoder().encode(input);
  const hash = await crypto.subtle.digest('SHA-256', data);
  return Array.from(new Uint8Array(hash))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}

export async function hashNormalizedPii(normalized: string): Promise<string> {
  return `sha256:${await sha256Hex(normalized)}`;
}

/**
 * Google Customer Match — email: lowercase, trim, Gmail dot/plus stripping.
 */
export function normalizeEmailForCustomerMatch(email: string): string {
  const trimmed = email.trim().toLowerCase();
  const at = trimmed.lastIndexOf('@');
  if (at <= 0 || at === trimmed.length - 1) {
    return trimmed;
  }
  let local = trimmed.slice(0, at);
  const domain = trimmed.slice(at + 1);
  if (GMAIL_DOMAINS.has(domain)) {
    local = local.replace(/\./g, '');
    const plus = local.indexOf('+');
    if (plus >= 0) {
      local = local.slice(0, plus);
    }
  }
  return `${local}@${domain}`;
}

/**
 * Google Customer Match — phone: E.164 when + present; digits-only otherwise (no country guess).
 */
export function normalizePhoneForCustomerMatch(phone: string): string {
  const trimmed = phone.trim();
  if (trimmed.includes('+')) {
    const digits = trimmed.replace(/\D/g, '');
    return digits ? `+${digits}` : '';
  }
  return trimmed.replace(/\D/g, '');
}

function normalizeGenericPiiString(value: string): string {
  return value.trim().toLowerCase();
}

function normalizePiiByFieldKey(fieldKey: string, value: string): string {
  const key = fieldKey.toLowerCase();
  if (EMAIL_FIELD_KEYS.has(key)) {
    return normalizeEmailForCustomerMatch(value);
  }
  if (PHONE_FIELD_KEYS.has(key)) {
    return normalizePhoneForCustomerMatch(value);
  }
  return normalizeGenericPiiString(value);
}

async function hashPiiValue(value: unknown, fieldKey?: string): Promise<unknown> {
  if (value === null || value === undefined) return value;
  if (typeof value === 'string') {
    const trimmed = value.trim();
    if (!trimmed) return value;
    const normalized = fieldKey ? normalizePiiByFieldKey(fieldKey, trimmed) : normalizeGenericPiiString(trimmed);
    if (!normalized) return value;
    return hashNormalizedPii(normalized);
  }
  if (typeof value === 'number' || typeof value === 'boolean') {
    return hashNormalizedPii(normalizeGenericPiiString(String(value)));
  }
  if (Array.isArray(value)) {
    return Promise.all(value.map((v) => hashPiiValue(v, fieldKey)));
  }
  if (typeof value === 'object') {
    return maskPiiInObject(value as Record<string, unknown>);
  }
  return value;
}

export async function maskPiiInObject(obj: Record<string, unknown>): Promise<Record<string, unknown>> {
  const out: Record<string, unknown> = {};
  for (const [key, val] of Object.entries(obj)) {
    if (PII_FIELD_KEYS.has(key.toLowerCase())) {
      out[key] = await hashPiiValue(val, key);
    } else if (val && typeof val === 'object' && !Array.isArray(val)) {
      out[key] = await maskPiiInObject(val as Record<string, unknown>);
    } else if (Array.isArray(val)) {
      out[key] = await Promise.all(
        val.map(async (item) =>
          item && typeof item === 'object' && !Array.isArray(item)
            ? maskPiiInObject(item as Record<string, unknown>)
            : item,
        ),
      );
    } else {
      out[key] = val;
    }
  }
  return out;
}

async function maskJsonBlock(jsonText: string): Promise<string> {
  try {
    const parsed = JSON.parse(jsonText) as unknown;
    if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
      return JSON.stringify(await maskPiiInObject(parsed as Record<string, unknown>), null, 2);
    }
    if (Array.isArray(parsed)) {
      const masked = await Promise.all(
        parsed.map(async (item) =>
          item && typeof item === 'object' && !Array.isArray(item)
            ? maskPiiInObject(item as Record<string, unknown>)
            : item,
        ),
      );
      return JSON.stringify(masked, null, 2);
    }
    return jsonText;
  } catch {
    return jsonText;
  }
}

async function maskFreeTextSegment(text: string): Promise<string> {
  const emails = [...text.matchAll(EMAIL_RE)];
  let out = text;
  for (const m of emails) {
    const raw = m[0];
    const normalized = normalizeEmailForCustomerMatch(raw);
    out = out.replaceAll(raw, await hashNormalizedPii(normalized));
  }
  const phones = [...out.matchAll(PHONE_RE)];
  for (const m of phones) {
    const raw = m[0];
    if (raw.replace(/\D/g, '').length < 7) continue;
    const normalized = normalizePhoneForCustomerMatch(raw);
    if (!normalized) continue;
    out = out.replaceAll(raw, await hashNormalizedPii(normalized));
  }
  return out;
}

/**
 * Przygotowuje Markdown raportu do eksportu na Google Workspace.
 * Nie modyfikuje rekordu D1 — tylko kanał webhook.
 */
export async function sanitizeReportForWorkspaceExport(markdown: string): Promise<string> {
  const jsonBlockRe = /```json\n([\s\S]*?)\n```/g;
  let sanitized = markdown;
  const blocks: { full: string; inner: string }[] = [];
  let match: RegExpExecArray | null;
  while ((match = jsonBlockRe.exec(markdown)) !== null) {
    blocks.push({ full: match[0], inner: match[1] ?? '' });
  }
  for (const block of blocks) {
    const maskedInner = await maskJsonBlock(block.inner);
    sanitized = sanitized.replace(block.full, `\`\`\`json\n${maskedInner}\n\`\`\``);
  }
  sanitized = await maskFreeTextSegment(sanitized);
  if (!sanitized.includes('maskowaniem PII')) {
    sanitized += '\n\n---\n_Eksport Workspace: pola PII zastąpione skrótem SHA-256 (Customer Match). SSOT: D1 `operator_daily_reports`._';
  }
  return sanitized;
}
