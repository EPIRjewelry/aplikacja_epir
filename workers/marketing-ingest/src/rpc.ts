/// <reference types="@cloudflare/workers-types" />

import { WorkerEntrypoint } from 'cloudflare:workers';
import type { Env } from './env';
import { buildMarketingPreviewBody, type MarketingPreviewBody } from './ops-preview';
import { yesterdayUtcDate } from './ga4';

/** S2S RPC — podgląd marketingu bez HTTP Bearer między workerami. */
export class MarketingIngestS2SRpc extends WorkerEntrypoint<Env> {
  async getMarketingPreview(args?: { date?: string }): Promise<MarketingPreviewBody> {
    const raw = args?.date?.trim();
    const date =
      raw && /^\d{4}-\d{2}-\d{2}$/.test(raw) ? raw : yesterdayUtcDate();
    return buildMarketingPreviewBody(this.env, date);
  }
}
