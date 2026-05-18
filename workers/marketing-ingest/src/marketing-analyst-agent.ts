import type { Env } from './env';
import { buildMarketingPreviewBody, type MarketingPreviewBody } from './ops-preview';
import { yesterdayUtcDate } from './ga4';

type StoredSummary = {
  date: string;
  google_ads_row_count: number;
  google_analytics_row_count: number;
  updated_at_ms: number;
};

function parseIsoDate(s: string | null | undefined): string | null {
  if (!s) return null;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) return null;
  return s;
}

/**
 * Stanowy **natywny Durable Object** (bez npm `agents` — konflikt `zod` w monorepo z Wrangler/Shopify).
 * Ten sam worker co ingest: `buildMarketingPreviewBody` + sekrety GA4/Ads już w `env`.
 *
 * Worker HTTP routuje tu żądania `/ops/marketing-analyst/{instance}/*` po weryfikacji Bearer
 * (`MARKETING_OPS_PREVIEW_KEY` — jak GET `/ops/marketing-preview`).
 */
export class MarketingAnalystAgent {
  constructor(
    private readonly state: DurableObjectState,
    private readonly env: Env,
  ) {}

  async fetch(request: Request): Promise<Response> {
    const u = new URL(request.url);
    const m = /^\/ops\/marketing-analyst\/[^/]+\/(refresh|state)$/.exec(u.pathname);
    if (!m) {
      return new Response('Not Found', { status: 404, headers: { 'Cache-Control': 'no-store' } });
    }
    const mode = m[1];

    if (mode === 'state' && request.method === 'GET') {
      const summary = await this.state.storage.get<StoredSummary>('summary');
      return new Response(JSON.stringify({ summary: summary ?? null }), {
        status: 200,
        headers: { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' },
      });
    }

    if (mode === 'refresh' && request.method === 'POST') {
      let body: { date?: string } = {};
      try {
        const text = await request.text();
        if (text.trim()) {
          body = JSON.parse(text) as { date?: string };
        }
      } catch {
        return new Response(JSON.stringify({ error: 'invalid JSON body' }), {
          status: 400,
          headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' },
        });
      }
      const date = parseIsoDate(body.date) ?? yesterdayUtcDate();
      let preview: MarketingPreviewBody;
      try {
        preview = await buildMarketingPreviewBody(this.env, date);
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e);
        return new Response(JSON.stringify({ error: 'preview_failed', message: msg }), {
          status: 502,
          headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' },
        });
      }
      const summary: StoredSummary = {
        date: preview.date,
        google_ads_row_count: preview.google_ads.rowCount,
        google_analytics_row_count: preview.google_analytics.rowCount,
        updated_at_ms: Date.now(),
      };
      await this.state.storage.put('summary', summary);
      return new Response(JSON.stringify({ ok: true, preview, summary }), {
        status: 200,
        headers: { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' },
      });
    }

    return new Response('Method Not Allowed', { status: 405, headers: { 'Cache-Control': 'no-store' } });
  }
}
