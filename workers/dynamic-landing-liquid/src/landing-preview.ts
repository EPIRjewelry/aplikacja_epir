import type {Env} from './env';

export const PREVIEW_SESSION_COOKIE = 'epir_landing_preview';
export const PREVIEW_SESSION_MAX_AGE_SECONDS = 86_400;

function configuredPreviewSecrets(env: Env): string[] {
  const out: string[] = [];
  const op = env.EPIR_OPERATOR_PANEL_SECRET?.trim();
  const marketing = env.MARKETING_OPS_PREVIEW_KEY?.trim();
  if (op) out.push(op);
  if (marketing && marketing !== op) out.push(marketing);
  return out;
}

function parseCookies(header: string | null): Record<string, string> {
  const out: Record<string, string> = {};
  if (!header) return out;
  for (const part of header.split(';')) {
    const t = part.trim();
    if (!t) continue;
    const i = t.indexOf('=');
    if (i === -1) continue;
    const key = t.slice(0, i).trim();
    const value = t.slice(i + 1).trim();
    if (!key) continue;
    try {
      out[key] = decodeURIComponent(value);
    } catch {
      out[key] = value;
    }
  }
  return out;
}

function tokenMatches(secret: string, candidate: string | null | undefined): boolean {
  if (!candidate?.trim() || !secret) return false;
  return candidate.trim() === secret;
}

function matchedSecret(
  secrets: string[],
  candidate: string | null | undefined,
): string | null {
  if (!candidate?.trim()) return null;
  return secrets.find((s) => tokenMatches(s, candidate)) ?? null;
}

/** First matching preview credential on this request (query, header, or session cookie). */
export function matchedPreviewSecret(request: Request, env: Env): string | null {
  const secrets = configuredPreviewSecrets(env);
  if (!secrets.length) return null;

  const url = new URL(request.url);
  const fromQuery = matchedSecret(secrets, url.searchParams.get('epir_preview'));
  if (fromQuery) return fromQuery;

  const fromAdmin = matchedSecret(secrets, request.headers.get('X-Admin-Key'));
  if (fromAdmin) return fromAdmin;

  const auth = request.headers.get('Authorization')?.trim() ?? '';
  const bearer = auth.startsWith('Bearer ') ? auth.slice(7).trim() : '';
  const fromBearer = matchedSecret(secrets, bearer);
  if (fromBearer) return fromBearer;

  const cookies = parseCookies(request.headers.get('Cookie'));
  return matchedSecret(secrets, cookies[PREVIEW_SESSION_COOKIE]);
}

/** Operator preview while LANDINGS_ENABLED=false (existing secrets only). */
export function isLandingPreviewRequest(request: Request, env: Env): boolean {
  return matchedPreviewSecret(request, env) !== null;
}

export function shouldRenderLandings(request: Request, env: Env): boolean {
  return (
    (env.LANDINGS_ENABLED ?? 'false').trim().toLowerCase() === 'true' ||
    isLandingPreviewRequest(request, env)
  );
}

export function previewAuthConfiguredCount(env: Env): number {
  return configuredPreviewSecrets(env).length;
}

export function hasPreviewAuthAttempt(request: Request): boolean {
  const url = new URL(request.url);
  if (url.searchParams.has('epir_preview')) return true;
  if (request.headers.get('X-Admin-Key')?.trim()) return true;
  const auth = request.headers.get('Authorization')?.trim() ?? '';
  if (auth.startsWith('Bearer ') && auth.length > 7) return true;
  const cookies = parseCookies(request.headers.get('Cookie'));
  return Boolean(cookies[PREVIEW_SESSION_COOKIE]?.trim());
}

export function previewSessionCookieHeader(secret: string): string {
  return `${PREVIEW_SESSION_COOKIE}=${encodeURIComponent(secret)}; Path=/; Max-Age=${PREVIEW_SESSION_MAX_AGE_SECONDS}; Secure; HttpOnly; SameSite=Lax`;
}

/** Drop token from address bar after first successful auth (cookie carries session). */
export function previewCleanUrl(request: Request): string | null {
  const url = new URL(request.url);
  if (!url.searchParams.has('epir_preview')) return null;
  url.searchParams.delete('epir_preview');
  return url.toString();
}

export function withPreviewSession(
  response: Response,
  secret: string | null,
): Response {
  if (!secret) return response;
  const headers = new Headers(response.headers);
  headers.append('Set-Cookie', previewSessionCookieHeader(secret));
  return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers,
  });
}
