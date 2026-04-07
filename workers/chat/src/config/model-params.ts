/**
 * worker/src/config/model-params.ts
 *
 * Centralna konfiguracja modelu AI dla chat workera.
 * EPIR używa jednego modelu tekstowo-obrazowego dla całego strumienia:
 * `@cf/moonshotai/kimi-k2.5`.
 */

/**
 * Kanoniczny model inference dla Workera (tekst + obraz + tool calls).
 * @see https://developers.cloudflare.com/workers-ai/models/kimi-k2.5/
 */
export const CHAT_MODEL_ID = '@cf/moonshotai/kimi-k2.5' as const;

/**
 * Model parameters for chat completions
 * 
 * These values are optimized for luxury jewelry e-commerce assistant:
 * - temperature: Controls randomness (0.5 = balanced creativity/consistency)
 * - max_tokens: Maximum response length (3000 = ~2000 words)
 * - top_p: Nucleus sampling threshold (0.9 = high quality, diverse responses)
 * 
 * For future tuning: create a new config file instead of mutating callers ad hoc.
 */
export const MODEL_PARAMS = {
  /**
   * Temperature: Controls randomness in responses
   * - 0.0 = deterministic (same input → same output)
   * - 1.0 = maximum creativity
   * - 0.5 = balanced (RECOMMENDED for luxury assistant)
   * 
   * @default 0.5
   */
  temperature: 0.5,

  /**
   * Max tokens: Maximum response length
   * - 1 token ≈ 0.75 words (English)
   * - 1 token ≈ 0.5 words (Polish, due to diacritics)
   * - 3000 tokens ≈ 1500-2000 words in Polish
   * 
   * @default 3000
   */
  max_tokens: 3000,

  /**
   * Top-p (nucleus sampling): Probability threshold for token selection
   * - 1.0 = consider all tokens
   * - 0.9 = consider top 90% probability mass (RECOMMENDED)
   * - 0.5 = very focused, less diverse
   * 
   * @default 0.9
   */
  top_p: 0.9,

  /**
   * Stream options: Include usage statistics in streaming response
   * Required for cost tracking and monitoring.
   * 
   * @default { include_usage: true }
   */
  stream_options: {
    include_usage: true,
  },
} as const;

/**
 * Type-safe export of model parameters
 * Use this in ai-client.ts to ensure consistency
 */
export type ModelParams = typeof MODEL_PARAMS;
