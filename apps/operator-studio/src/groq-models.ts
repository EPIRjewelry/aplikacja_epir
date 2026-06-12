/** Warianty Groq / Workers AI (bez presetów or_* — te są w katalogu OpenRouter). */
export type GroqModelVariantKey =
  | ''
  | 'kimi_k25'
  | 'k26'
  | 'glm_flash'
  | 'qwen3_30b_a3b'
  | 'gemma4_26b'
  | 'scout_17b';

export type GroqModelOption = {
  key: GroqModelVariantKey;
  label: string;
};

export const GROQ_MODEL_OPTIONS: GroqModelOption[] = [
  { key: '', label: 'default — GPT-OSS-120B (Groq / AI Gateway)' },
  { key: 'kimi_k25', label: 'kimi_k25 — Kimi K2.5 (Workers AI, multimodal)' },
  { key: 'k26', label: 'k26 — Kimi K2.6 (Workers AI, multimodal)' },
  { key: 'glm_flash', label: 'glm_flash — GLM-4.7-flash' },
  { key: 'qwen3_30b_a3b', label: 'qwen3_30b_a3b — Qwen3-30B-A3B MoE' },
  { key: 'gemma4_26b', label: 'gemma4_26b — Gemma 4 26B (multimodal)' },
  { key: 'scout_17b', label: 'scout_17b — alias GPT-OSS-120B' },
];

const MULTIMODAL_KEYS = new Set<GroqModelVariantKey>(['kimi_k25', 'k26', 'gemma4_26b']);

export function isGroqVariantMultimodal(key: GroqModelVariantKey): boolean {
  return MULTIMODAL_KEYS.has(key);
}
