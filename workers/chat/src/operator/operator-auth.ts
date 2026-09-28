/**
 * Auth Operator Studio / odczyty analityki.
 * - `EPIR_OPERATOR_PANEL_SECRET` — pełny dostęp (mutacje + odczyt)
 * - `EPIR_READONLY_ANALYTICS_KEY` — tylko odczyt: flow-health, raporty, Q1–Q10
 */

export type OperatorAuthEnv = {
  EPIR_OPERATOR_PANEL_SECRET?: string;
  EPIR_READONLY_ANALYTICS_KEY?: string;
};

function timingSafeEqualText(expected: string, provided: string): boolean {
  const encoder = new TextEncoder();
  const expectedBytes = encoder.encode(expected);
  const providedBytes = encoder.encode(provided);
  if (expectedBytes.length !== providedBytes.length) return false;
  let result = 0;
  for (let i = 0; i < expectedBytes.length; i++) {
    result |= expectedBytes[i]! ^ providedBytes[i]!;
  }
  return result === 0;
}

function providedAdminKey(request: Request): string {
  return (
    request.headers.get('X-Admin-Key')?.trim() ||
    request.headers.get('x-admin-key')?.trim() ||
    ''
  );
}

function providedBearer(request: Request): string {
  const h = request.headers.get('Authorization')?.trim() ?? '';
  const m = /^Bearer\s+(.+)$/i.exec(h);
  return m?.[1]?.trim() ?? '';
}

function matchesSecret(provided: string, secret: string | undefined): boolean {
  const expected = secret?.trim() ?? '';
  return Boolean(expected && provided && timingSafeEqualText(expected, provided));
}

/** Pełny klucz panelu (mutacje Studio, czat operatora). */
export function verifyOperatorPanelKey(request: Request, env: OperatorAuthEnv): boolean {
  const provided = providedAdminKey(request) || providedBearer(request);
  return matchesSecret(provided, env.EPIR_OPERATOR_PANEL_SECRET);
}

/**
 * Odczyt analityki: pełny klucz **lub** `EPIR_READONLY_ANALYTICS_KEY`
 * (`X-Admin-Key` albo `Authorization: Bearer`).
 */
export function verifyAnalyticsReadAccess(request: Request, env: OperatorAuthEnv): boolean {
  if (verifyOperatorPanelKey(request, env)) return true;
  const provided = providedAdminKey(request) || providedBearer(request);
  return matchesSecret(provided, env.EPIR_READONLY_ANALYTICS_KEY);
}

export function analyticsReadUnauthorizedResponse(corsHeaders: Record<string, string>): Response {
  return new Response(JSON.stringify({ error: 'Unauthorized' }), {
    status: 401,
    headers: { 'Content-Type': 'application/json', ...corsHeaders },
  });
}
