const MAX_NAME = 120;
const MAX_EMAIL = 254;
const MAX_PHONE = 40;
const MAX_VISION = 4000;
const MAX_SHORT = 80;
const MAX_BYTES = 10 * 1024 * 1024;

export function sanitizeEmailHeader(value: string, maxLen = 200): string {
  return value.replace(/[\r\n\x00-\x1f\x7f]/g, '').trim().slice(0, maxLen);
}

export function trimField(value: FormDataEntryValue | null, maxLen: number): string | null {
  if (typeof value !== 'string') return null;
  const t = value.trim();
  if (!t) return null;
  return t.slice(0, maxLen);
}

export function requireTrimmed(value: FormDataEntryValue | null, maxLen: number): string | null {
  const t = trimField(value, maxLen);
  return t && t.length > 0 ? t : null;
}

export function isValidEmail(email: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) && email.length <= MAX_EMAIL;
}

export function truncateUserAgent(ua: string | null): string | null {
  if (!ua) return null;
  return ua.slice(0, 256);
}

export async function sha256Hex(input: string): Promise<string> {
  const data = new TextEncoder().encode(input);
  const digest = await crypto.subtle.digest('SHA-256', data);
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

export function buildReferenceId(now = Date.now()): string {
  const year = new Date(now).getUTCFullYear();
  const suffix = crypto.randomUUID().replace(/-/g, '').slice(0, 8).toUpperCase();
  return `EPIR-${year}-${suffix}`;
}

export function detectImageContentType(bytes: Uint8Array): 'image/jpeg' | 'image/png' | null {
  if (bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) {
    return 'image/jpeg';
  }
  if (
    bytes.length >= 8
    && bytes[0] === 0x89
    && bytes[1] === 0x50
    && bytes[2] === 0x4e
    && bytes[3] === 0x47
    && bytes[4] === 0x0d
    && bytes[5] === 0x0a
    && bytes[6] === 0x1a
    && bytes[7] === 0x0a
  ) {
    return 'image/png';
  }
  return null;
}

export type UploadReadResult =
  | { ok: true; bytes: Uint8Array; contentType: 'image/jpeg' | 'image/png'; fileName: string }
  | { ok: false; message: string };

function validateUploadBytes(bytes: Uint8Array, fileNameHint: string): UploadReadResult {
  if (bytes.length <= 0) {
    return { ok: false, message: 'Plik jest pusty.' };
  }
  if (bytes.length > MAX_BYTES) {
    return { ok: false, message: 'Plik jest za duży (max 10 MB).' };
  }
  const contentType = detectImageContentType(bytes);
  if (!contentType) {
    return { ok: false, message: 'Dozwolone formaty: PNG, JPG.' };
  }
  const safeName = (fileNameHint || 'upload').replace(/[^\w.\-]+/g, '_').slice(0, 120);
  return { ok: true, bytes, contentType, fileName: safeName };
}

export async function readUploadFile(file: File): Promise<UploadReadResult> {
  if (file.size <= 0) {
    return { ok: false, message: 'Plik jest pusty.' };
  }
  if (file.size > MAX_BYTES) {
    return { ok: false, message: 'Plik jest za duży (max 10 MB).' };
  }
  const buffer = await file.arrayBuffer();
  return validateUploadBytes(new Uint8Array(buffer), file.name || 'upload');
}

/** App Proxy nie przekazuje niezawodnie binarnych pól multipart — storefront wysyła base64. */
export function readUploadBase64(base64Raw: string, fileNameHint: string | null): UploadReadResult {
  const cleaned = base64Raw.replace(/\s/g, '');
  if (!cleaned) {
    return { ok: false, message: 'Plik jest pusty.' };
  }

  let bytes: Uint8Array;
  try {
    bytes = Uint8Array.from(Buffer.from(cleaned, 'base64'));
  } catch {
    return { ok: false, message: 'Niepoprawny format załącznika.' };
  }

  return validateUploadBytes(bytes, fileNameHint || 'upload');
}

export const FIELD_LIMITS = {
  MAX_NAME,
  MAX_EMAIL,
  MAX_PHONE,
  MAX_VISION,
  MAX_SHORT,
};
