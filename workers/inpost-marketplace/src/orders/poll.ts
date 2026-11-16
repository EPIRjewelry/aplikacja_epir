import type { Env } from '../env';
import { InpsaApiClient, countOrderEvents, type InpsaOrderEventRecord } from '../inpsa-api';
import { shopifyIdempotencyKeyForEvent } from './idempotency';
import { planShopifyOrderFromEvent } from './shopify-stub';

export interface PollOrdersEventsResult {
  httpStatus: number;
  events: InpsaOrderEventRecord[];
  shopifyPlans: ReturnType<typeof planShopifyOrderFromEvent>[];
}

/**
 * UC v1 step 2 entry: poll INPSA order events.
 * Shopify Admin API create is stubbed until operator provides app credentials on this worker.
 */
export async function pollOrdersEventsPipeline(
  env: Env,
  options: { limit?: number; cursor?: string; dryRun?: boolean } = {},
): Promise<PollOrdersEventsResult> {
  const client = new InpsaApiClient(env);
  const poll = await client.fetchOrdersEvents({
    limit: options.limit ?? 50,
    cursor: options.cursor,
  });

  const events = extractEvents(poll.body);
  const shopifyPlans = events.map((event) => planShopifyOrderFromEvent(event));
  const idempotencyKeys = events
    .map((event) => shopifyIdempotencyKeyForEvent(event))
    .filter((key): key is string => key != null);

  if (!options.dryRun) {
    // TODO(UC v1): persist cursor + idempotencyKeys (KV/D1), then Shopify Admin API orderCreate.
    void idempotencyKeys;
  }

  return {
    httpStatus: poll.status,
    events,
    shopifyPlans,
  };
}

function extractEvents(body: { events?: InpsaOrderEventRecord[]; items?: InpsaOrderEventRecord[]; data?: InpsaOrderEventRecord[] } | null): InpsaOrderEventRecord[] {
  if (!body) return [];
  const list = body.events ?? body.items ?? body.data ?? [];
  return Array.isArray(list) ? list : [];
}

export { countOrderEvents };
