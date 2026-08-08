import type { MappingConfig } from './types.js';

export function resolveOpenRouterModels(mapping: MappingConfig): string[] {
  const fromEnv = process.env.OPENROUTER_MODELS?.trim();
  if (fromEnv) {
    return fromEnv.split(',').map((m) => m.trim()).filter(Boolean);
  }
  const single = process.env.OPENROUTER_MODEL?.trim();
  if (single) return [single];
  return mapping.titleEnrichment.aiModels?.length
    ? [...mapping.titleEnrichment.aiModels]
    : ['moonshotai/kimi-k3', 'x-ai/grok-4.5'];
}

export async function openRouterChat(
  prompt: string,
  models: string[],
  opts?: { maxTokens?: number; temperature?: number },
): Promise<{ text: string; model: string } | null> {
  const apiKey = process.env.OPENROUTER_API_KEY?.trim();
  if (!apiKey) return null;

  for (const model of models) {
    const response = await fetch('https://openrouter.ai/api/v1/chat/completions', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
        'HTTP-Referer': 'https://epirbizuteria.pl',
        'X-Title': 'epir-marketing-ingest',
      },
      body: JSON.stringify({
        model,
        messages: [{ role: 'user', content: prompt }],
        max_tokens: opts?.maxTokens ?? 120,
        temperature: opts?.temperature ?? 0.4,
      }),
    });

    if (!response.ok) {
      console.warn(
        `[openrouter] ${model} failed: HTTP ${response.status}`,
      );
      continue;
    }

    const payload = (await response.json()) as {
      choices?: Array<{ message?: { content?: string } }>;
    };
    const text = payload.choices?.[0]?.message?.content?.trim();
    if (text) return { text, model };
  }

  return null;
}
