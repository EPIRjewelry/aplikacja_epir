import { Agent, callable } from 'agents';
import type { Env } from './env';
import { OpenRouterClient } from './openrouter-client';

export type SidecarState = {
  lastFetchAt: string | null;
  lastHttpStatus: number | null;
  lastBytes: number | null;
};

/**
 * Project B / ops sidecar: lightweight metadata in DO state only (no full preview body).
 * @see https://github.com/EPIRjewelry/aplikacja_epir/blob/main/docs/EPIR_CLOUDFLARE_AGENT_SERVICE_PLAN.md
 */
export class MarketingSidecarAgent extends Agent<Env, SidecarState> {
  initialState: SidecarState = {
    lastFetchAt: null,
    lastHttpStatus: null,
    lastBytes: null,
  };

  @callable()
  async loadPreview(date?: string): Promise<{
    ok: boolean;
    status: number;
    bytes: number;
    fetchedAt: string;
  }> {
    const rawOrigin = (this.env.MARKETING_INGEST_ORIGIN ?? '').trim();
    const token = (this.env.MARKETING_OPS_BEARER_TOKEN ?? '').trim();
    if (!rawOrigin || !token) {
      return {
        ok: false,
        status: 503,
        bytes: 0,
        fetchedAt: new Date().toISOString(),
      };
    }

    const base = rawOrigin.replace(/\/+$/, '');
    const url = new URL('/ops/marketing-preview', `${base}/`);

    if (date) url.searchParams.set('date', date);

    const res = await fetch(url.toString(), {
      headers: { Authorization: `Bearer ${token}` },
    });

    const buf = await res.arrayBuffer();
    const bytes = buf.byteLength;
    const fetchedAt = new Date().toISOString();

    this.setState({
      lastFetchAt: fetchedAt,
      lastHttpStatus: res.status,
      lastBytes: bytes,
    });

    return {
      ok: res.ok,
      status: res.status,
      bytes,
      fetchedAt,
    };
  }

  @callable()
  getSidecarSummary(): SidecarState {
    return this.state;
  }

  @callable()
  listModels(): readonly { id: string; label: string }[] {
    return OpenRouterClient.listModels();
  }
}
