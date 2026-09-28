/**
 * Auth Operator Studio / odczyty analityki.
 * - `EPIR_OPERATOR_PANEL_SECRET` — pełny dostęp (mutacje + odczyt, PII)
 * - `EPIR_READONLY_ANALYTICS_KEY` — tylko odczyt agregatów: ready, flow-health,
 *   steward/insights, raporty, analytics/query (whitelist bez treści czatu)
 */

/** Pełna whitelist queryId (zgodna z bigquery-batch analytics-query-ids). */
export const ANALYTICS_QUERY_IDS = [
  'Q1_CONVERSION_CHAT',
  'Q2_CONVERSION_PATHS',
  'Q3_TOP_CHAT_QUESTIONS',
  'Q4_STOREFRONT_SEGMENTATION',
  'Q5_TOP_PRODUCTS',
  'Q6_CHAT_ENGAGEMENT',
  'Q7_PRODUCT_TO_PURCHASE',
  'Q8_DAILY_EVENTS',
  'Q9_TOOL_USAGE',
  'Q10_SESSION_DURATION',
] as const;

/**
 * queryId dozwolone dla klucza tylko do odczytu.
 * Wykluczone: Q3_TOP_CHAT_QUESTIONS (kolumna `content` = treść wiadomości użytkownika).
 * Pozostałe Q* nie zwracają e-maili, telefonów ani treści rozmów (tylko agregaty /
 * session_id / page_url / event_type / tool name).
 */
export const READONLY_SAFE_ANALYTICS_QUERY_IDS = [
  'Q1_CONVERSION_CHAT',
  'Q2_CONVERSION_PATHS',
  'Q4_STOREFRONT_SEGMENTATION',
  'Q5_TOP_PRODUCTS',
  'Q6_CHAT_ENGAGEMENT',
  'Q7_PRODUCT_TO_PURCHASE',
  'Q8_DAILY_EVENTS',
  'Q9_TOOL_USAGE',
  'Q10_SESSION_DURATION',
] as const;

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

function providedCredential(request: Request): string {
  return providedAdminKey(request) || providedBearer(request);
}

function matchesSecret(provided: string, secret: string | undefined): boolean {
  const expected = secret?.trim() ?? '';
  return Boolean(expected && provided && timingSafeEqualText(expected, provided));
}

/** Pełny klucz panelu (mutacje Studio, czat operatora, PII). */
export function verifyOperatorPanelKey(request: Request, env: OperatorAuthEnv): boolean {
  return matchesSecret(providedCredential(request), env.EPIR_OPERATOR_PANEL_SECRET);
}

/**
 * Odczyt analityki: pełny klucz **lub** `EPIR_READONLY_ANALYTICS_KEY`
 * (`X-Admin-Key` albo `Authorization: Bearer` — bez `?key=`).
 */
export function verifyAnalyticsReadAccess(request: Request, env: OperatorAuthEnv): boolean {
  if (verifyOperatorPanelKey(request, env)) return true;
  return matchesSecret(providedCredential(request), env.EPIR_READONLY_ANALYTICS_KEY);
}

/** True gdy żądanie autoryzowane wyłącznie kluczem readonly (nie pełnym panelem). */
export function isReadonlyAnalyticsCredential(request: Request, env: OperatorAuthEnv): boolean {
  if (verifyOperatorPanelKey(request, env)) return false;
  return matchesSecret(providedCredential(request), env.EPIR_READONLY_ANALYTICS_KEY);
}

export function isWhitelistedAnalyticsQueryId(queryId: string): boolean {
  return (ANALYTICS_QUERY_IDS as readonly string[]).includes(queryId);
}

export function isReadonlySafeAnalyticsQueryId(queryId: string): boolean {
  return (READONLY_SAFE_ANALYTICS_QUERY_IDS as readonly string[]).includes(queryId);
}

export function analyticsReadUnauthorizedResponse(corsHeaders: Record<string, string>): Response {
  return new Response(JSON.stringify({ error: 'Unauthorized' }), {
    status: 401,
    headers: { 'Content-Type': 'application/json', ...corsHeaders },
  });
}
