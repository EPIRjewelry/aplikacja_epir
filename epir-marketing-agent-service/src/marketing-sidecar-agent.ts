import { Agent, callable } from 'agents';
import type { Env } from './env';
import { OpenRouterClient } from './openrouter-client';
import {
  AVAILABLE_MODELS,
  isModelId,
  resolveActiveModel,
  type ModelId,
} from './openrouter-config';

export type SidecarState = {
  lastFetchAt: string | null;
  lastHttpStatus: number | null;
  lastBytes: number | null;
  activeModel: ModelId | null;
};

export type ChatMessage = { role: 'user' | 'assistant'; content: string };

/**
 * Project B / ops sidecar: lightweight metadata in DO state only (no full preview body).
 * @see https://github.com/EPIRjewelry/aplikacja_epir/blob/main/docs/EPIR_CLOUDFLARE_AGENT_SERVICE_PLAN.md
 */
export class MarketingSidecarAgent extends Agent<Env, SidecarState> {
  initialState: SidecarState = {
    lastFetchAt: null,
    lastHttpStatus: null,
    lastBytes: null,
    activeModel: null,
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
      ...this.state,
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

  @callable()
  async setAgentModel(params: { modelId: ModelId }): Promise<{ activeModel: ModelId }> {
    if (!isModelId(params.modelId)) {
      throw new Error(`invalid_model:${params.modelId}`);
    }
    this.setState({ ...this.state, activeModel: params.modelId });
    return { activeModel: params.modelId };
  }

  @callable()
  async askAI(params: {
    messages: ChatMessage[];
    modelOverride?: ModelId;
    injectDataPreview?: boolean;
  }): Promise<
    | { ok: true; model: string; content: string | null }
    | { ok: false; error: string }
  > {
    const apiKey = this.env.OPENROUTER_API_KEY?.trim();
    if (!apiKey) {
      return { ok: false, error: 'openrouter_not_configured' };
    }

    const model = resolveActiveModel(
      params.modelOverride,
      this.state.activeModel,
      this.env.OPENROUTER_DEFAULT_MODEL,
    );

    let messages = [...params.messages];
    if (params.injectDataPreview) {
      const preview = await this.loadPreview();
      const context: ChatMessage = {
        role: 'user',
        content: [
          '[marketing-preview-metadata]',
          `ok=${preview.ok}`,
          `http_status=${preview.status}`,
          `bytes=${preview.bytes}`,
          `fetched_at=${preview.fetchedAt}`,
        ].join(' '),
      };
      messages = [context, ...messages];
    }

    const client = new OpenRouterClient(this.env);
    const completion = await client.chat(messages, model);
    const content = completion.choices[0]?.message?.content ?? null;
    return { ok: true, model, content };
  }
}

export { resolveActiveModel, AVAILABLE_MODELS };
