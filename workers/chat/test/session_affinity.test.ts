import { describe, expect, it } from 'vitest';
import { workersAiRunOptions, __test } from '../src/ai-client';

const { normalizeWorkersAiSessionId } = __test;

describe('normalizeWorkersAiSessionId (x-session-affinity / widget compatibility)', () => {
  it('accepts crypto.randomUUID() shape used by ChatWidget and handleChat fallback', () => {
    const id = '550e8400-e29b-41d4-a716-446655440000';
    expect(normalizeWorkersAiSessionId(id)).toBe(id);
  });

  it('accepts suffix form used for image caption turns', () => {
    const base = '550e8400-e29b-41d4-a716-446655440000';
    const combined = `${base}_img_caption`;
    expect(normalizeWorkersAiSessionId(combined)).toBe(combined);
  });

  it('truncates to 64 chars while keeping safe charset', () => {
    const long = `${'a'.repeat(60)}-bcde`;
    expect(long.length).toBeGreaterThan(64);
    const out = normalizeWorkersAiSessionId(long);
    expect(out?.length).toBe(64);
    expect(out).toMatch(/^[A-Za-z0-9_-]+$/);
  });

  it('rejects characters outside [A-Za-z0-9_-] (no silent affinity)', () => {
    expect(normalizeWorkersAiSessionId('bad id')).toBeUndefined();
    expect(normalizeWorkersAiSessionId('x@y')).toBeUndefined();
    expect(normalizeWorkersAiSessionId('a:b')).toBeUndefined();
  });

  it('workersAiRunOptions returns header only when normalized id is set', () => {
    expect(workersAiRunOptions(undefined)).toBeUndefined();
    expect(workersAiRunOptions('')).toBeUndefined();
    expect(workersAiRunOptions('bad id')).toBeUndefined();
    expect(workersAiRunOptions('550e8400-e29b-41d4-a716-446655440000')).toEqual({
      headers: { 'x-session-affinity': 'ses_550e8400-e29b-41d4-a716-446655440000' },
    });
  });
});
