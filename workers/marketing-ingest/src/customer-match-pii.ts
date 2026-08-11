/**
 * Google Customer Match — normalizacja PII przed SHA-256 (SSOT: report-pii-mask w bigquery-batch).
 */

const GMAIL_DOMAINS = new Set(['gmail.com', 'googlemail.com']);

export async function sha256Hex(input: string): Promise<string> {
  const data = new TextEncoder().encode(input);
  const hash = await crypto.subtle.digest('SHA-256', data);
  return Array.from(new Uint8Array(hash))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}

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

export async function hashEmailForCustomerMatch(email: string): Promise<string | null> {
  const normalized = normalizeEmailForCustomerMatch(email);
  if (!normalized || !normalized.includes('@')) return null;
  return sha256Hex(normalized);
}
