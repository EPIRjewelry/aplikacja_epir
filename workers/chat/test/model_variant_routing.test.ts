import { describe, it, expect } from 'vitest';
import { __test } from '../src/ai-client';
import { MODEL_VARIANTS, resolveModelVariant } from '../src/config/model-params';

const { resolveAdminModelVariantFromHeaders } = __test as unknown as {
  resolveAdminModelVariantFromHeaders: (
    headers: { get(name: string): string | null },
    env: { ADMIN_KEY?: string },
    context?: { hasImage?: boolean },
  ) => typeof MODEL_VARIANTS.default | null;
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
  const adminKey = 'test-admin-key-42';

  it('returns null when X-Epir-Model-Variant header is absent', () => {
    const result = resolveAdminModelVariantFromHeaders(
      fakeHeaders({ Authorization: `Bearer ${adminKey}` }),
      { ADMIN_KEY: adminKey },
    );
    expect(result).toBeNull();
  });

  it('returns null when Authorization header is absent (buyer-facing guard)', () => {
    const result = resolveAdminModelVariantFromHeaders(
      fakeHeaders({ 'X-Epir-Model-Variant': 'k26' }),
      { ADMIN_KEY: adminKey },
    );
    expect(result).toBeNull();
  });

  it('returns null when ADMIN_KEY is misconfigured (missing env)', () => {
    const result = resolveAdminModelVariantFromHeaders(
      fakeHeaders({
        'X-Epir-Model-Variant': 'k26',
        Authorization: `Bearer ${adminKey}`,
      }),
      {},
    );
    expect(result).toBeNull();
  });

  it('returns null when bearer token does not match ADMIN_KEY', () => {
    const result = resolveAdminModelVariantFromHeaders(
      fakeHeaders({
        'X-Epir-Model-Variant': 'k26',
        Authorization: `Bearer wrong-key`,
      }),
      { ADMIN_KEY: adminKey },
    );
    expect(result).toBeNull();
  });

  it('returns null for unknown variant keys (silent fallback)', () => {
    const result = resolveAdminModelVariantFromHeaders(
      fakeHeaders({
        'X-Epir-Model-Variant': 'definitely-not-a-variant',
        Authorization: `Bearer ${adminKey}`,
      }),
      { ADMIN_KEY: adminKey },
    );
    expect(result).toBeNull();
  });

  it('returns variant when all checks pass', () => {
    const result = resolveAdminModelVariantFromHeaders(
      fakeHeaders({
        'X-Epir-Model-Variant': 'k26',
        Authorization: `Bearer ${adminKey}`,
      }),
      { ADMIN_KEY: adminKey },
    );
    expect(result).not.toBeNull();
    expect(result!.id).toBe(MODEL_VARIANTS.k26.id);
  });

  it('returns null when variant is not multimodal but request has image', () => {
    const result = resolveAdminModelVariantFromHeaders(
      fakeHeaders({
        'X-Epir-Model-Variant': 'glm_flash',
        Authorization: `Bearer ${adminKey}`,
      }),
      { ADMIN_KEY: adminKey },
      { hasImage: true },
    );
    expect(result).toBeNull();
  });

  it('returns variant when non-multimodal variant is used without image', () => {
    const result = resolveAdminModelVariantFromHeaders(
      fakeHeaders({
        'X-Epir-Model-Variant': 'glm_flash',
        Authorization: `Bearer ${adminKey}`,
      }),
      { ADMIN_KEY: adminKey },
      { hasImage: false },
    );
    expect(result).not.toBeNull();
    expect(result!.id).toBe(MODEL_VARIANTS.glm_flash.id);
  });
});

describe('MODEL_VARIANTS integrity', () => {
  it('default variant is the canonical Kimi K2.5', () => {
    expect(MODEL_VARIANTS.default.id).toBe('@cf/moonshotai/kimi-k2.5');
    expect(MODEL_VARIANTS.default.multimodal).toBe(true);
    expect(MODEL_VARIANTS.default.toolLeak).toBe(true);
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
