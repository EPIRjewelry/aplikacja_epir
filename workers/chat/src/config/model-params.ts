/**
 * worker/src/config/model-params.ts
 *
 * Centralna konfiguracja modelu AI dla chat workera.
 *
 * Po migracji na format Harmony kanonicznym modelem czatu jest
 * `groq/openai/gpt-oss-120b` (Groq via Cloudflare AI Gateway). Model:
 * • używa kanałów Harmony (`analysis` / `commentary` / `final`) — wycieki narzędzi
 *   do warstwy klienta są hermetyzowane przez API, nie wymagają regex-scrubingu,
 * • obsługuje natywne, równoległe `tool_calls` w jednym kroku,
 * • respektuje parametry `include_reasoning` i `reasoning_effort` w body.
 */

/**
 * Capabilities pojedynczego wariantu modelu. Używane do guardów runtime:
 * - `multimodal: false` → ignoruj wariant dla requestów z obrazem (fallback do default).
 * - `toolLeak: true`   → DEPRECATED: zostawione jako metadana historyczna; nie jest już używane
 *   do regex-scrubbingu po stronie workera (Harmony hermetyzuje kanały narzędzi).
 */
export type ModelCapabilities = {
  readonly id: string;
  readonly multimodal: boolean;
  /** @deprecated od wersji 4.0 (Harmony). Trzymane wyłącznie dla zgodności wariantów A/B. */
  readonly toolLeak: boolean;
  /** OpenRouter: generacja obrazu / SVG (Recraft V4.1 — wymaga modalities image+text). */
  readonly imageGen?: boolean;
  /** Opcjonalny opis dla logów / bench raportów. */
  readonly label?: string;
};

/**
 * Zbiór wariantów modelu dostępnych za headerem `X-Epir-Model-Variant` (admin-only).
 *
 * `default` to `groq/openai/gpt-oss-120b` (Harmony, Groq przez AI Gateway). Wariant
 * `kimi_k25` (poprzedni kanon Workers AI) zostawiamy jako alternatywę admin-only
 * do testów A/B i fallbacku, ale produkcyjnie nie jest już używany.
 *
 * @see https://console.groq.com/docs/model/openai/gpt-oss-120b
 * @see https://developers.cloudflare.com/workers-ai/models/kimi-k2.5/
 */
export const MODEL_VARIANTS = {
  default: {
    id: 'groq/openai/gpt-oss-120b',
    multimodal: false,
    toolLeak: false,
    label: 'GPT-OSS-120B (Groq via AI Gateway — Harmony, canonical)',
  },
  /**
   * @deprecated Legacy Workers AI (`kimi-k2.5`). Nadal dostępny wyłącznie przez
   * `X-Epir-Model-Variant` + Bearer `EPIR_OPERATOR_PANEL_SECRET` — patrz
   * `resolveAdminModelVariantFromHeaders` w `ai-client.ts` oraz `index.ts`.
   */
  kimi_k25: {
    id: '@cf/moonshotai/kimi-k2.5',
    multimodal: true,
    toolLeak: true,
    label: 'Kimi K2.5 (Workers AI — legacy admin-only fallback)',
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
  /**
   * Google Gemma 4 26B A4B IT — MoE, 256K kontekstu, reasoning + tools + vision.
   * Tańszy odpowiednik Kimi K2.5 przy zbliżonym zestawie możliwości.
   * @see https://developers.cloudflare.com/workers-ai/models/gemma-4-26b-a4b-it/
   */
  gemma4_26b: {
    id: '@cf/google/gemma-4-26b-a4b-it',
    multimodal: true,
    toolLeak: false,
    label: 'Gemma 4 26B A4B IT (candidate — cheaper Kimi-class)',
  },
  /**
   * Alias `scout_17b` — wcześniej oznaczał kandydata Llama 4 Scout, dzisiaj wskazuje
   * na ten sam `groq/openai/gpt-oss-120b` co default. Zachowany dla benchmarków /
   * skryptów, które historycznie podawały klucz `scout_17b`.
   */
  scout_17b: {
    id: 'groq/openai/gpt-oss-120b',
    multimodal: false,
    toolLeak: false,
    label: 'GPT-OSS-120B (alias scout_17b, Harmony)',
  },
  or_llama70b: {
    id: 'openrouter/meta-llama/llama-2-70b-chat',
    multimodal: false,
    toolLeak: false,
    label: 'Llama 2 70B (OpenRouter)',
  },
  or_gemini_pro: {
    id: 'openrouter/google/gemini-pro',
    multimodal: true,
    toolLeak: false,
    label: 'Gemini Pro (OpenRouter)',
  },
  or_gpt4o_mini: {
    id: 'openrouter/openai/gpt-4o-mini',
    multimodal: true,
    toolLeak: false,
    label: 'GPT-4o-mini (OpenRouter)',
  },
  or_claude3_opus: {
    id: 'openrouter/anthropic/claude-3-opus',
    multimodal: true,
    toolLeak: false,
    label: 'Claude 3 Opus (OpenRouter)',
  },
  or_mistral7b: {
    id: 'openrouter/mistralai/mistral-7b-instruct',
    multimodal: false,
    toolLeak: false,
    label: 'Mistral 7B Instruct (OpenRouter)',
  },
  or_gemini2_flash: {
    id: 'openrouter/google/gemini-flash-2.0',
    multimodal: true,
    toolLeak: false,
    label: 'Gemini 2.0 Flash (OpenRouter)',
  },
  or_deepseek_v4: {
    id: 'openrouter/deepseek/deepseek-chat',
    multimodal: false,
    toolLeak: false,
    label: 'DeepSeek V4 Flash (OpenRouter)',
  },
  or_gpt4o: {
    id: 'openrouter/openai/gpt-4o',
    multimodal: true,
    toolLeak: false,
    label: 'GPT-4o (OpenRouter)',
  },
  or_llama31_405b: {
    id: 'openrouter/meta-llama/llama-3.1-405b-instruct',
    multimodal: false,
    toolLeak: false,
    label: 'Llama 3.1 405B (OpenRouter)',
  },
  or_claude_sonnet_4: {
    id: 'openrouter/anthropic/claude-sonnet-4',
    multimodal: true,
    toolLeak: false,
    label: 'Claude Sonnet 4 (OpenRouter)',
  },
  or_gpt41: {
    id: 'openrouter/openai/gpt-4.1',
    multimodal: true,
    toolLeak: false,
    label: 'GPT-4.1 (OpenRouter)',
  },
  or_recraft_v41: {
    id: 'openrouter/recraft/recraft-v4.1',
    multimodal: true,
    toolLeak: false,
    imageGen: true,
    label: 'Recraft V4.1',
  },
  or_recraft_v41_vector: {
    id: 'openrouter/recraft/recraft-v4.1-vector',
    multimodal: true,
    toolLeak: false,
    imageGen: true,
    label: 'Recraft V4.1 Vector',
  },
  or_recraft_v41_pro: {
    id: 'openrouter/recraft/recraft-v4.1-pro',
    multimodal: true,
    toolLeak: false,
    imageGen: true,
    label: 'Recraft V4.1 Pro',
  },
  or_recraft_v41_pro_vector: {
    id: 'openrouter/recraft/recraft-v4.1-pro-vector',
    multimodal: true,
    toolLeak: false,
    imageGen: true,
    label: 'Recraft V4.1 Pro Vector',
  },
  or_recraft_v41_utility: {
    id: 'openrouter/recraft/recraft-v4.1-utility',
    multimodal: true,
    toolLeak: false,
    imageGen: true,
    label: 'Recraft V4.1 Utility',
  },
  or_recraft_v41_utility_vector: {
    id: 'openrouter/recraft/recraft-v4.1-utility-vector',
    multimodal: true,
    toolLeak: false,
    imageGen: true,
    label: 'Recraft V4.1 Utility Vector',
  },
  or_recraft_v41_utility_pro: {
    id: 'openrouter/recraft/recraft-v4.1-utility-pro',
    multimodal: true,
    toolLeak: false,
    imageGen: true,
    label: 'Recraft V4.1 Utility Pro',
  },
  or_recraft_v41_utility_pro_vector: {
    id: 'openrouter/recraft/recraft-v4.1-utility-pro-vector',
    multimodal: true,
    toolLeak: false,
    imageGen: true,
    label: 'Recraft V4.1 Utility Pro Vector',
  },
} as const satisfies Record<string, ModelCapabilities>;

export type ModelVariantKey = keyof typeof MODEL_VARIANTS;

/** Klucze wariantów Recraft V4.1 (OpenRouter image/SVG). */
export const RECRAFT_MODEL_VARIANT_KEYS: readonly ModelVariantKey[] = [
  'or_recraft_v41',
  'or_recraft_v41_vector',
  'or_recraft_v41_pro',
  'or_recraft_v41_pro_vector',
  'or_recraft_v41_utility',
  'or_recraft_v41_utility_vector',
  'or_recraft_v41_utility_pro',
  'or_recraft_v41_utility_pro_vector',
];

/**
 * Kanoniczny model inference dla czatu (Harmony — `groq/openai/gpt-oss-120b`).
 * Domyślnie używany dla ruchu storefront i internal dashboard.
 * Warianty ALT dostępne tylko za adminskim nagłówkiem; patrz `resolveModelVariant`.
 */
export const CHAT_MODEL_ID = MODEL_VARIANTS.default.id;

/** getGroqResponse po nieudanej pętli narzędzi — bardzo krótki tekst (np. 1–2 zdania), minimalne opóźnienie. */
export const CHAT_RECOVERY_MAX_TOKENS = 256;

/**
 * Bufor `max_tokens` dla rundy, w której model może zwrócić `tool_calls` (JSON argumentów)
 * razem z preambułą Harmony — Harmony konsumuje część budżetu na kanał `analysis`,
 * więc trzymamy 2048, aby uniknąć ucięcia odpowiedzi w połowie.
 */
export const CHAT_MAX_TOKENS_TOOL_ROUND = 2048;
export const CHAT_MAX_TOKENS_AFTER_TOOL = 768;

/**
 * Dedykowany model dla ekstrakcji soft-facts (style/intent/event).
 * GLM-4.7-flash — krótszy czas niż Qwen MoE; krótki JSON nie wymaga dużego budżetu tokenów.
 */
export const EXTRACTOR_LLM_MODEL_ID = MODEL_VARIANTS.glm_flash.id;

/** `max_tokens` w `extractFactsLLM` — wystarczające na tablicę JSON; mniejsze ryzyko długiego „reasoning”. */
export const EXTRACTOR_LLM_MAX_TOKENS = 320;
/** Jednorazowy retry przy błędzie API lub JSON uciętym w połowie. */
export const EXTRACTOR_LLM_MAX_TOKENS_RETRY = 512;

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

/** Poziomy wysiłku rozumowania Harmony. `low` = krótki łańcuch myśli, lepsza latencja. */
export type ReasoningEffort = 'low' | 'medium' | 'high';

/**
 * Parametry modelu dla Harmony / GPT-OSS-120B (Groq via AI Gateway).
 *
 * Kluczowe różnice względem poprzedniej generacji (Kimi/Workers AI):
 * - `max_tokens` = 2048 — Harmony zużywa część budżetu na kanał `analysis`
 *   (`reasoning`), więc 1300 było za mało i ucinało finalną wypowiedź.
 * - `include_reasoning` = `true` — Groq zwraca `delta.reasoning` w streamie;
 *   parser w `ai-client.ts createGroqStreamTransform` odrzuca ten kanał z widoku
 *   klienta, ale używamy go do telemetrii i ewentualnego debugowania.
 * - `reasoning_effort` = `'low'` — buyer-facing UX wymaga niskiej latencji
 *   i krótkiego łańcucha myśli; admin/internal-dashboard może override'ować.
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
   * Max tokens: maksymalna długość odpowiedzi (łącznie z kanałem `analysis`
   * w formacie Harmony). 2048 zostawia ~1.5K na finalny tekst po obsłudze
   * `reasoning_effort: 'low'` i ewentualnych argumentach `tool_calls`.
   *
   * @default 2048
   */
  max_tokens: 2048,

  /**
   * Top-p (nucleus sampling): Probability threshold for token selection
   * - 1.0 = consider all tokens
   * - 0.9 = consider top 90% probability mass (RECOMMENDED)
   *
   * @default 0.9
   */
  top_p: 0.9,

  /**
   * Twardy flag Harmony: dołącz kanał `reasoning` do streamu. Parser odfiltrowuje
   * go z `delta` widocznego dla klienta i emituje jako osobne zdarzenie diagnostyczne.
   *
   * @default true
   */
  include_reasoning: true as const,

  /**
   * Niski poziom „chain of thought" — szybsze TTFT i mniej tokenów reasoning.
   *
   * @default 'low'
   */
  reasoning_effort: 'low' as ReasoningEffort,

  /**
   * Stream options: Include usage statistics in streaming response.
   * Wymagane do liczenia kosztów i metryk cache.
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
