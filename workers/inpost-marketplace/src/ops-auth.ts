import type { Env } from './env';

export function verifyOperatorBearer(req: Request, env: Env): boolean {
  const expected = env.EPIR_OPERATOR_PANEL_SECRET?.trim();
  if (!expected) return false;
  const match = /^Bearer\s+(\S+)/i.exec(req.headers.get('Authorization') ?? '');
  return (match?.[1]?.trim() ?? '') === expected;
}

export function opsUnauthorized(): Response {
  return new Response('Unauthorized', {
    status: 401,
    headers: { 'WWW-Authenticate': 'Bearer', 'Cache-Control': 'no-store' },
  });
}

export function opsNotConfigured(): Response {
  return new Response('Not Found', { status: 404, headers: { 'Cache-Control': 'no-store' } });
}

export function opsJson(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body, null, 2), {
    status,
    headers: {
      'Content-Type': 'application/json; charset=utf-8',
      'Cache-Control': 'no-store',
    },
  });
}
