/**
 * worker/src/config/model-params.ts
 *
 * Centralna konfiguracja modelu AI dla chat workera.
 * EPIR używa jednego modelu tekstowo-obrazowego dla całego strumienia:
 * `@cf/moonshotai/kimi-k2.5`.
 */

/**
 * Capabilities pojedynczego wariantu modelu. Używane do guardów runtime:
 * - `multimodal: false` → ignoruj wariant dla requestów z obrazem (fallback do default).
 * - `toolLeak: true`   → uruchom `stripLeakedToolCallsLiterals` na output (Kimi-specific bug).
 */
export type ModelCapabilities = {
  readonly id: string;
  readonly multimodal: boolean;
  readonly toolLeak: boolean;
  /** Opcjonalny opis dla logów / bench raportów. */
  readonly label?: string;
};

/**
 * Zbiór wariantów modelu dostępnych za headerem `X-Epir-Model-Variant` (admin-only).
 * `default` MUSI pozostać `@cf/moonshotai/kimi-k2.5` — to kanoniczny model z `.model-lock`.
 * Nowe warianty dodawaj tu, żeby benchmark harness (`scripts/bench-models.ts`) automatycznie
 * je pokrył.
 *
 * @see https://developers.cloudflare.com/workers-ai/models/kimi-k2.5/
 */
export const MODEL_VARIANTS = {
  default: {
    id: '@cf/moonshotai/kimi-k2.5',
    multimodal: true,
    toolLeak: true,
    label: 'Kimi K2.5 (canonical)',
  },
  k26: {
    id: '@cf/moonshotai/kimi-k2.6',
    multimodal: true,
    toolLeak: true,
    label: 'Kimi K2.6 (candidate — larger context, similar arch)',
  },
  glm_flash: {
    id: '@cf/zai-org/glm-4.7-flash',
    multimodal: false,
    toolLeak: false,
    label: 'GLM-4.7-flash (candidate — lightweight router / classifier)',
  },
  /**
   * Szybki MoE (aktywacja ~3B na forward) — mocniejszy niż GLM-Flash, nadal odpowiedni do bench/admin A-B.
   * @see https://developers.cloudflare.com/workers-ai/models/qwen3-30b-a3b-fp8/
   */
  qwen3_30b_a3b: {
    id: '@cf/qwen/qwen3-30b-a3b-fp8',
    multimodal: false,
    toolLeak: false,
    label: 'Qwen3-30B-A3B MoE (fast + stronger — candidate)',
  },
} as const satisfies Record<string, ModelCapabilities>;

export type ModelVariantKey = keyof typeof MODEL_VARIANTS;

/**
 * Kanoniczny model inference dla Workera (tekst + obraz + tool calls). W produkcji zawsze ten.
 * Warianty ALT dostępne tylko za adminskim nagłówkiem; patrz `resolveModelVariant`.
 */
export const CHAT_MODEL_ID = MODEL_VARIANTS.default.id;

/**
 * Dedykowany model dla ekstrakcji soft-facts (style/intent/event).
 * Qwen3 MoE — stabilniejszy niż GLM-4.7 w Workers AI (puste `message.content` przy `finish_reason: length`).
 */
export const EXTRACTOR_LLM_MODEL_ID = MODEL_VARIANTS.qwen3_30b_a3b.id;

/** `max_tokens` w `extractFactsLLM` — 300 bywało za ciasne (`finish_reason: length`). */
export const EXTRACTOR_LLM_MAX_TOKENS = 700;
/** Jednorazowy retry przy błędzie API lub JSON uciętym w połowie. */
export const EXTRACTOR_LLM_MAX_TOKENS_RETRY = 1000;

/**
 * Limit czasu pierwszej próby `Promise.race` w `extractFactsLLM` (kolejka pamięci).
 */
export const EXTRACTOR_LLM_TIMEOUT_MS = 10_000;

/**
 * Dłuższy limit na drugą próbę / retry (po pierwszym błędzie lub uciętym JSON), żeby uniknąć fałszywego
 * `extractor_timeout` gdy drugi `ai.run` potrzebuje > pierwszego limitu.
 */
export const EXTRACTOR_LLM_TIMEOUT_RETRY_MS = 16_000;

/**
 * Zwraca capabilities dla danego klucza wariantu (z fallbackiem na `default`).
 * Gwarantuje, że caller zawsze dostaje prawidłowy, istniejący wariant.
 */
export function resolveModelVariant(key: string | undefined | null): ModelCapabilities {
  if (!key) return MODEL_VARIANTS.default;
  const candidate = (MODEL_VARIANTS as Record<string, ModelCapabilities | undefined>)[key];
  return candidate ?? MODEL_VARIANTS.default;
}

/** Lista kluczy wariantów — przydatna w bench scripts i testach. */
export const MODEL_VARIANT_KEYS = Object.keys(MODEL_VARIANTS) as readonly ModelVariantKey[];

/**
 * Model parameters for chat completions
 * 
 * These values are optimized for luxury jewelry e-commerce assistant:
 * - temperature: Controls randomness (0.5 = balanced creativity/consistency)
 * - max_tokens: Maximum response length (1300 ≈ zwięzła odpowiedź po polsku)
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
   * - 1300 tokens ≈ ok. 600–900 słów po polsku (orientacyjnie)
   * 
   * @default 1300
   */
  max_tokens: 1300,

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
