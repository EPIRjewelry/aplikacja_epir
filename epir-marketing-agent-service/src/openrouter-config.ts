export const AVAILABLE_MODELS = [
  { id: 'meta-llama/llama-2-70b-chat', label: 'Llama 2 70B (Chat)' },
  { id: 'google/gemini-pro', label: 'Gemini Pro' },
  { id: 'openai/gpt-4o-mini', label: 'OpenAI GPT-4o-mini' },
  { id: 'anthropic/claude-3-opus', label: 'Claude 3 Opus' },
  { id: 'mistralai/mistral-7b-instruct', label: 'Mistral 7B Instruct' },
  { id: 'google/gemini-flash-2.0', label: 'Gemini 2.0 Flash' },
  { id: 'deepseek/deepseek-chat', label: 'DeepSeek V4 Flash' },
  { id: 'openai/gpt-4o', label: 'GPT-4o' },
  { id: 'meta-llama/llama-3.1-405b-instruct', label: 'Llama 3.1 405B' },
] as const;

export type ModelId = typeof AVAILABLE_MODELS[number]['id'];

const MODEL_IDS = new Set<string>(AVAILABLE_MODELS.map(m => m.id));

export function isModelId(value: string | undefined | null): value is ModelId {
  return !!value && MODEL_IDS.has(value);
}

/** Per-request override → DO state → env default → first catalog entry. */
export function resolveActiveModel(
  modelOverride: ModelId | undefined,
  stateModel: ModelId | null,
  envDefault: string | undefined,
): ModelId {
  if (modelOverride && isModelId(modelOverride)) return modelOverride;
  if (stateModel && isModelId(stateModel)) return stateModel;
  const fromEnv = envDefault?.trim();
  if (fromEnv && isModelId(fromEnv)) return fromEnv;
  return AVAILABLE_MODELS[0].id;
}