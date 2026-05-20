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