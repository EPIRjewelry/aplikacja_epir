/**
 * worker/src/rate-limiter.ts
 *
 * Per-shop token bucket rate limiter using Durable Objects.
 * Chroni przed przekroczeniem limitów Shopify Admin API i MCP.
 */

export interface Env {
  RATE_LIMITER_DO: DurableObjectNamespace;
}

/**
 * Token bucket configuration per shop
 */
interface TokenBucketConfig {
  maxTokens: number;      // Max tokens in bucket (burst capacity)
  refillRate: number;     // Tokens per second
  refillInterval: number; // Milliseconds between refills
}

interface PersistedBucketState {
  tokens?: unknown;
  lastRefill?: unknown;
}

const DEFAULT_CONFIG: TokenBucketConfig = {
  maxTokens: 40,          // Shopify Admin API: 40 requests per second
  refillRate: 2,          // Refill 2 tokens per interval (40/sec = 2 per 50ms)
  refillInterval: 50      // Refill every 50ms
};

/**
 * Durable Object dla rate limiting per shop
 */
export class RateLimiterDO {
  private state: DurableObjectState;
  private tokens: number = DEFAULT_CONFIG.maxTokens;
  private lastRefill: number = Date.now();
  private config: TokenBucketConfig = DEFAULT_CONFIG;
  private initialized: Promise<void>;

  private static readonly STORAGE_KEY = 'rate_limiter_bucket_v1';

  constructor(state: DurableObjectState) {
    this.state = state;
    this.initialized = this.state.blockConcurrencyWhile(async () => {
      try {
        await this.loadState();
      } catch (error) {
        console.error('[RateLimiterDO] Failed to initialize state', error);
        throw error;
      }
    });
  }

  async fetch(request: Request): Promise<Response> {
    await this.initialized;
    const url = new URL(request.url);
    const method = url.pathname.split('/').pop();

    switch (method) {
      case 'consume':
        return this.handleConsume(request);
      case 'check':
        return this.handleCheck();
      case 'reset':
        return this.handleReset();
      default:
        return new Response('Not Found', { status: 404 });
    }
  }

  /**
   * Spróbuj skonsumować tokeny (domyślnie 1)
   */
  private async handleConsume(request: Request): Promise<Response> {
    const body = await request.json().catch(() => ({ tokens: 1 })) as { tokens?: unknown };
    const tokensToConsume = this.parseTokensToConsume(body.tokens);

    if (tokensToConsume <= 0) {
      return Response.json(
        { error: 'Invalid tokens value. Expected a positive finite number.' },
        { status: 400 },
      );
    }

    this.refillTokens();

    if (this.tokens >= tokensToConsume) {
      this.tokens -= tokensToConsume;
      await this.persistState();
      return Response.json({
        allowed: true,
        tokens: this.tokens,
        maxTokens: this.config.maxTokens
      });
    }

    // Oblicz retry-after (ile ms do następnego refill)
    const retryAfterMs = this.config.refillInterval;
    await this.persistState();
    
    return Response.json({
      allowed: false,
      tokens: this.tokens,
      maxTokens: this.config.maxTokens,
      retryAfterMs
    }, { status: 429 });
  }

  /**
   * Sprawdź dostępne tokeny bez konsumpcji
   */
  private async handleCheck(): Promise<Response> {
    const stateChanged = this.refillTokens();
    if (stateChanged) {
      await this.persistState();
    }
    
    return Response.json({
      tokens: this.tokens,
      maxTokens: this.config.maxTokens,
      lastRefill: this.lastRefill
    });
  }

  /**
   * Resetuj bucket (tylko do testów)
   */
  private async handleReset(): Promise<Response> {
    this.tokens = this.config.maxTokens;
    this.lastRefill = Date.now();
    await this.persistState();
    
    return Response.json({ reset: true, tokens: this.tokens });
  }

  /**
   * Refill tokens based on time elapsed
   */
  private refillTokens(): boolean {
    const now = Date.now();
    const elapsed = now - this.lastRefill;
    const intervals = Math.floor(elapsed / this.config.refillInterval);

    if (intervals > 0) {
      const tokensToAdd = intervals * this.config.refillRate;
      const previousTokens = this.tokens;
      this.tokens = Math.min(this.config.maxTokens, this.tokens + tokensToAdd);
      this.lastRefill = now;
      return this.tokens !== previousTokens;
    }
    return false;
  }

  private async loadState(): Promise<void> {
    const persisted = await this.state.storage.get<PersistedBucketState>(RateLimiterDO.STORAGE_KEY);
    if (!persisted || typeof persisted !== 'object') {
      return;
    }

    const now = Date.now();
    const normalizedTokens = this.normalizeTokens(persisted.tokens);
    const normalizedLastRefill = this.normalizeLastRefill(persisted.lastRefill, now);

    this.tokens = normalizedTokens;
    this.lastRefill = normalizedLastRefill;

    const persistedTokens = typeof persisted.tokens === 'number' ? persisted.tokens : undefined;
    const persistedLastRefill = typeof persisted.lastRefill === 'number' ? persisted.lastRefill : undefined;
    const hasInvalidValues =
      persistedTokens !== normalizedTokens || persistedLastRefill !== normalizedLastRefill;

    if (hasInvalidValues) {
      await this.persistState();
    }
  }

  private async persistState(): Promise<void> {
    const now = Date.now();
    const safeTokens = this.normalizeTokens(this.tokens);
    const safeLastRefill = this.normalizeLastRefill(this.lastRefill, now);
    this.tokens = safeTokens;
    this.lastRefill = safeLastRefill;

    await this.state.storage.put(RateLimiterDO.STORAGE_KEY, {
      tokens: safeTokens,
      lastRefill: safeLastRefill,
    });
  }

  private parseTokensToConsume(rawTokens: unknown): number {
    if (rawTokens == null) {
      return 1;
    }
    if (typeof rawTokens !== 'number' || !Number.isFinite(rawTokens)) {
      return 0;
    }
    return Math.floor(rawTokens);
  }

  private normalizeTokens(rawTokens: unknown): number {
    if (typeof rawTokens !== 'number' || !Number.isFinite(rawTokens)) {
      return this.config.maxTokens;
    }
    return Math.max(0, Math.min(this.config.maxTokens, Math.floor(rawTokens)));
  }

  private normalizeLastRefill(rawLastRefill: unknown, now: number): number {
    if (typeof rawLastRefill !== 'number' || !Number.isFinite(rawLastRefill)) {
      return now;
    }
    const safeLastRefill = Math.floor(rawLastRefill);
    if (safeLastRefill < 0) {
      return now;
    }
    return Math.min(safeLastRefill, now);
  }
}

/**
 * Helper function to check rate limit for a shop
 */
export async function checkRateLimit(
  shopDomain: string,
  env: Env,
  tokensToConsume: number = 1
): Promise<{ allowed: boolean; retryAfterMs?: number }> {
  const id = env.RATE_LIMITER_DO.idFromName(shopDomain);
  const stub = env.RATE_LIMITER_DO.get(id);
  
  const safeTokens = Number.isFinite(tokensToConsume) && tokensToConsume > 0
    ? Math.floor(tokensToConsume)
    : 1;

  try {
    const response = await stub.fetch('https://dummy/consume', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ tokens: safeTokens })
    });

    const payload = await response.json().catch(() => ({})) as {
      allowed?: unknown;
      retryAfterMs?: unknown;
    };
    const retryAfterMs = typeof payload.retryAfterMs === 'number' && Number.isFinite(payload.retryAfterMs)
      ? payload.retryAfterMs
      : undefined;

    if (!response.ok) {
      return { allowed: false, retryAfterMs };
    }
    return { allowed: payload.allowed === true, retryAfterMs };
  } catch (error) {
    console.error('[RateLimiterDO] checkRateLimit failed closed', error);
    return { allowed: false };
  }
}
