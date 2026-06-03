import { describe, it, expect, beforeEach, vi } from 'vitest';
import { __test } from '../src/ai-client';
import { MODEL_VARIANTS, resolveModelVariant } from '../src/config/model-params';
import { __resetOpenRouterCatalogCacheForTests } from '../src/openrouter-catalog';

const {
  resolveAdminModelVariantFromHeaders,
  resolveDynamicOpenRouterModelFromHeaders,
  resolveOperatorModelOverride,
} = __test as unknown as {
  resolveAdminModelVariantFromHeaders: (
    headers: { get(name: string): string | null },
    env: { EPIR_OPERATOR_PANEL_SECRET?: string },
    context?: { hasImage?: boolean },
  ) => typeof MODEL_VARIANTS.default | null;
  resolveDynamicOpenRouterModelFromHeaders: (
    headers: { get(name: string): string | null },
    env: { EPIR_OPERATOR_PANEL_SECRET?: string; OPENROUTER_API_KEY?: string },
    context?: { hasImage?: boolean },
  ) => Promise<typeof MODEL_VARIANTS.default | null>;
  resolveOperatorModelOverride: (
    headers: { get(name: string): string | null },
    env: { EPIR_OPERATOR_PANEL_SECRET?: string; OPENROUTER_API_KEY?: string },
    context?: { hasImage?: boolean },
  ) => Promise<typeof MODEL_VARIANTS.default | null>;
};

function fakeHeaders(entries: Record<string, string>) {
  return {
    get(name: string) {
      const lower = name.toLowerCase();
      for (const [k, v] of Object.entries(entries)) {
        if (k.toLowerCase() === lower) return v;
      }
      return null;
    },
  };
}

describe('resolveAdminModelVariantFromHeaders', () => {
  const panelSecret = 'test-operator-panel-secret-42chars_min_len___';

  it('returns null when X-Epir-Model-Variant header is absent', () => {
    const result = resolveAdminModelVariantFromHeaders(
      fakeHeaders({ Authorization: `Bearer ${panelSecret}` }),
      { EPIR_OPERATOR_PANEL_SECRET: panelSecret },
    );
    expect(result).toBeNull();
  });

  it('returns null when Authorization header is absent (buyer-facing guard)', () => {
    const result = resolveAdminModelVariantFromHeaders(
      fakeHeaders({ 'X-Epir-Model-Variant': 'k26' }),
      { EPIR_OPERATOR_PANEL_SECRET: panelSecret },
    );
    expect(result).toBeNull();
  });

  it('returns null when EPIR_OPERATOR_PANEL_SECRET is missing from env', () => {
    const result = resolveAdminModelVariantFromHeaders(
      fakeHeaders({
        'X-Epir-Model-Variant': 'k26',
        Authorization: `Bearer ${panelSecret}`,
      }),
      {},
    );
    expect(result).toBeNull();
  });

  it('returns null when bearer token does not match operator panel secret', () => {
    const result = resolveAdminModelVariantFromHeaders(
      fakeHeaders({
        'X-Epir-Model-Variant': 'k26',
        Authorization: `Bearer wrong-key`,
      }),
      { EPIR_OPERATOR_PANEL_SECRET: panelSecret },
    );
    expect(result).toBeNull();
  });

  it('returns null for unknown variant keys (silent fallback)', () => {
    const result = resolveAdminModelVariantFromHeaders(
      fakeHeaders({
        'X-Epir-Model-Variant': 'definitely-not-a-variant',
        Authorization: `Bearer ${panelSecret}`,
      }),
      { EPIR_OPERATOR_PANEL_SECRET: panelSecret },
    );
    expect(result).toBeNull();
  });

  it('returns variant when all checks pass', () => {
    const result = resolveAdminModelVariantFromHeaders(
      fakeHeaders({
        'X-Epir-Model-Variant': 'k26',
        Authorization: `Bearer ${panelSecret}`,
      }),
      { EPIR_OPERATOR_PANEL_SECRET: panelSecret },
    );
    expect(result).not.toBeNull();
    expect(result!.id).toBe(MODEL_VARIANTS.k26.id);
  });

  it('returns null when variant is not multimodal but request has image', () => {
    const result = resolveAdminModelVariantFromHeaders(
      fakeHeaders({
        'X-Epir-Model-Variant': 'glm_flash',
        Authorization: `Bearer ${panelSecret}`,
      }),
      { EPIR_OPERATOR_PANEL_SECRET: panelSecret },
      { hasImage: true },
    );
    expect(result).toBeNull();
  });

  it('returns variant when non-multimodal variant is used without image', () => {
    const result = resolveAdminModelVariantFromHeaders(
      fakeHeaders({
        'X-Epir-Model-Variant': 'glm_flash',
        Authorization: `Bearer ${panelSecret}`,
      }),
      { EPIR_OPERATOR_PANEL_SECRET: panelSecret },
      { hasImage: false },
    );
    expect(result).not.toBeNull();
    expect(result!.id).toBe(MODEL_VARIANTS.glm_flash.id);
  });

  it('returns qwen3_30b_a3b when non-multimodal and no image', () => {
    const result = resolveAdminModelVariantFromHeaders(
      fakeHeaders({
        'X-Epir-Model-Variant': 'qwen3_30b_a3b',
        Authorization: `Bearer ${panelSecret}`,
      }),
      { EPIR_OPERATOR_PANEL_SECRET: panelSecret },
      { hasImage: false },
    );
    expect(result).not.toBeNull();
    expect(result!.id).toBe(MODEL_VARIANTS.qwen3_30b_a3b.id);
  });

  it('returns null for qwen3_30b_a3b when request has image (text-only model)', () => {
    const result = resolveAdminModelVariantFromHeaders(
      fakeHeaders({
        'X-Epir-Model-Variant': 'qwen3_30b_a3b',
        Authorization: `Bearer ${panelSecret}`,
      }),
      { EPIR_OPERATOR_PANEL_SECRET: panelSecret },
      { hasImage: true },
    );
    expect(result).toBeNull();
  });
});

describe('resolveDynamicOpenRouterModelFromHeaders', () => {
  const panelSecret = 'test-operator-panel-secret-42chars_min_len___';

  beforeEach(() => {
    __resetOpenRouterCatalogCacheForTests();
    vi.unstubAllGlobals();
  });

  it('returns null without X-Epir-OpenRouter-Model header', async () => {
    const result = await resolveDynamicOpenRouterModelFromHeaders(
      fakeHeaders({ Authorization: `Bearer ${panelSecret}` }),
      { EPIR_OPERATOR_PANEL_SECRET: panelSecret, OPENROUTER_API_KEY: 'sk-or' },
    );
    expect(result).toBeNull();
  });

  it('returns capabilities for catalog slug with valid bearer', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(
        new Response(
          JSON.stringify({
            data: [
              {
                id: 'recraft/recraft-v4.1',
                name: 'Recraft v4.1',
                architecture: { output_modalities: ['image'] },
              },
            ],
          }),
          { status: 200 },
        ),
      ),
    );

    const result = await resolveDynamicOpenRouterModelFromHeaders(
      fakeHeaders({
        Authorization: `Bearer ${panelSecret}`,
        'X-Epir-OpenRouter-Model': 'recraft/recraft-v4.1',
      }),
      { EPIR_OPERATOR_PANEL_SECRET: panelSecret, OPENROUTER_API_KEY: 'sk-or' },
    );
    expect(result).not.toBeNull();
    expect(result!.id).toBe('openrouter/recraft/recraft-v4.1');
    expect(result!.imageGen).toBe(true);
  });

  it('resolveOperatorModelOverride prefers preset over dynamic slug', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(
        new Response(
          JSON.stringify({
            data: [{ id: 'openai/gpt-4o', name: 'GPT-4o', architecture: {} }],
          }),
          { status: 200 },
        ),
      ),
    );

    const result = await resolveOperatorModelOverride(
      fakeHeaders({
        Authorization: `Bearer ${panelSecret}`,
        'X-Epir-Model-Variant': 'k26',
        'X-Epir-OpenRouter-Model': 'openai/gpt-4o',
      }),
      { EPIR_OPERATOR_PANEL_SECRET: panelSecret, OPENROUTER_API_KEY: 'sk-or' },
    );
    expect(result!.id).toBe(MODEL_VARIANTS.k26.id);
  });
});

describe('MODEL_VARIANTS integrity', () => {
  it('default variant is the canonical Harmony GPT-OSS-120B (Groq)', () => {
    expect(MODEL_VARIANTS.default.id).toBe('groq/openai/gpt-oss-120b');
    expect(MODEL_VARIANTS.default.toolLeak).toBe(false);
  });

  it('legacy Kimi K2.5 variant remains available for admin A/B', () => {
    expect(MODEL_VARIANTS.kimi_k25.id).toBe('@cf/moonshotai/kimi-k2.5');
    expect(MODEL_VARIANTS.kimi_k25.multimodal).toBe(true);
  });

  it('resolveModelVariant falls back to default for unknown keys', () => {
    expect(resolveModelVariant(undefined)).toBe(MODEL_VARIANTS.default);
    expect(resolveModelVariant(null)).toBe(MODEL_VARIANTS.default);
    expect(resolveModelVariant('nonsense')).toBe(MODEL_VARIANTS.default);
    expect(resolveModelVariant('k26').id).toBe(MODEL_VARIANTS.k26.id);
  });

  it('all variants declare capability flags', () => {
    for (const [key, v] of Object.entries(MODEL_VARIANTS)) {
      expect(typeof v.id, `${key}.id`).toBe('string');
      expect(typeof v.multimodal, `${key}.multimodal`).toBe('boolean');
      expect(typeof v.toolLeak, `${key}.toolLeak`).toBe('boolean');
    }
  });
});
