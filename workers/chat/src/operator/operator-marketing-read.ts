/**
 * Odczyt agregatów marketingu z Operator Studio (klucz readonly lub pełny panel).
 * Woła wyłącznie metody read RPC `epir-marketing-ingest`. Bez mutacji Ads.
 * Odpowiedź jest czyszczona z pól e-mail / token zanim wyjdzie do klienta.
 */

import type { Env } from '../config/bindings';
import { analyticsReadUnauthorizedResponse, verifyAnalyticsReadAccess } from './operator-auth';

const PREVIEW_PATH = '/internal/operator-studio/api/marketing-preview';
const GMC_PATH = '/internal/operator-studio/api/gmc-diagnostics';
const ADS_AUDIT_PATH = '/internal/operator-studio/api/ads-account-change-audit';

const REDACTED_KEYS = new Set([
  'user',
  'useremail',
  'email',
  'access_token',
  'refresh_token',
  'client_secret',
  'developer_token',
  'authorization',
  'id_token',
]);

function json(body: unknown, status: number, corsHeaders: Record<string, string>): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store', ...corsHeaders },
  });
}

function scrubString(value: string): string {
  return value.replace(/Bearer\s+\S+/gi, 'Bearer [redacted]').slice(0, 400);
}

/** Usuwa pola PII / tokenów z payloadu Ads/GMC zanim trafi do klucza readonly. */
export function redactMarketingReadPayload(value: unknown): unknown {
  if (typeof value === 'string') return scrubString(value);
  if (Array.isArray(value)) return value.map((item) => redactMarketingReadPayload(item));
  if (!value || typeof value !== 'object') return value;
  const out: Record<string, unknown> = {};
  for (const [key, child] of Object.entries(value as Record<string, unknown>)) {
    if (REDACTED_KEYS.has(key.toLowerCase())) continue;
    out[key] = redactMarketingReadPayload(child);
  }
  return out;
}

function scrubError(e: unknown): string {
  const raw = e instanceof Error ? e.message : String(e);
  return scrubString(raw).slice(0, 300);
}

/**
 * GET marketing-preview / gmc-diagnostics / ads-account-change-audit.
 * Zwraca null, gdy ścieżka nie należy do tego modułu.
 */
export async function handleOperatorMarketingRead(
  request: Request,
  env: Env,
  url: URL,
  method: string,
  corsHeaders: Record<string, string>,
): Promise<Response | null> {
  const path = url.pathname;
  const kind =
    path === PREVIEW_PATH ? 'preview' : path === GMC_PATH ? 'gmc' : path === ADS_AUDIT_PATH ? 'ads' : null;
  if (!kind) return null;

  if (method !== 'GET') {
    return json({ ok: false, error: 'method_not_allowed' }, 405, corsHeaders);
  }
  if (!verifyAnalyticsReadAccess(request, env)) {
    return analyticsReadUnauthorizedResponse(corsHeaders);
  }

  const rpc = env.MARKETING_INGEST_RPC;
  if (!rpc?.getMarketingPreview) {
    return json(
      { ok: false, error: 'MARKETING_INGEST_RPC missing getMarketingPreview' },
      503,
      corsHeaders,
    );
  }

  try {
    if (kind === 'preview') {
      const rawDate = url.searchParams.get('date')?.trim() ?? '';
      if (rawDate && !/^\d{4}-\d{2}-\d{2}$/.test(rawDate)) {
        return json({ ok: false, error: 'date_invalid', hint: 'YYYY-MM-DD' }, 400, corsHeaders);
      }
      const body = await rpc.getMarketingPreview(rawDate ? { date: rawDate } : undefined);
      return json({ ok: true, source: 'marketing_preview', result: redactMarketingReadPayload(body) }, 200, corsHeaders);
    }
    if (kind === 'gmc') {
      if (!rpc.getGmcDiagnostics) {
        return json({ ok: false, error: 'MARKETING_INGEST_RPC missing getGmcDiagnostics' }, 503, corsHeaders);
      }
      const body = await rpc.getGmcDiagnostics();
      return json({ ok: true, source: 'gmc_diagnostics', result: redactMarketingReadPayload(body) }, 200, corsHeaders);
    }
    if (!rpc.getAdsAccountChangeAudit) {
      return json(
        { ok: false, error: 'MARKETING_INGEST_RPC missing getAdsAccountChangeAudit' },
        503,
        corsHeaders,
      );
    }
    const body = await rpc.getAdsAccountChangeAudit();
    return json(
      { ok: true, source: 'ads_account_change_audit', result: redactMarketingReadPayload(body) },
      200,
      corsHeaders,
    );
  } catch (e: unknown) {
    return json({ ok: false, error: 'marketing_read_failed', message: scrubError(e) }, 502, corsHeaders);
  }
}
