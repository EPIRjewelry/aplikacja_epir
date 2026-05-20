import OpenAI from 'openai';
import { AVAILABLE_MODELS, type ModelId } from './openrouter-config';
import type { Env } from './env';

export class OpenRouterClient {
  private client: OpenAI;
  private model: ModelId;

  constructor(private readonly env: Env) {
    const apiKey = env.OPENROUTER_API_KEY?.trim();
    const requested = env.OPENROUTER_DEFAULT_MODEL?.trim() as ModelId | undefined;
    this.model = AVAILABLE_MODELS.some(m => m.id === requested) && requested
      ? requested
      : (env.OPENROUTER_DEFAULT_MODEL?.trim() as ModelId) ?? AVAILABLE_MODELS[0].id;
    this.client = new OpenAI({
      apiKey,
      baseURL: 'https://openrouter.ai/api/v1',
    });
  }

  async chat(messages: { role: 'user' | 'assistant'; content: string }[], modelOverride?: ModelId) {
    const model = modelOverride && AVAILABLE_MODELS.some(m => m.id === modelOverride)
      ? modelOverride
      : this.model;
    return this.client.chat.completions.create({
      model,
      messages,
    });
  }

  static listModels() {
    return AVAILABLE_MODELS;
  }
}