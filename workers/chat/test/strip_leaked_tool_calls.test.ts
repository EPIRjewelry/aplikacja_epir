import { describe, it, expect } from 'vitest';
import { stripLeakedToolCallsLiterals } from '../src/utils/stripLeakedToolCallsLiterals';

describe('stripLeakedToolCallsLiterals', () => {
  it('removes literal tool_calls JSON blob from model echo', () => {
    const raw =
      'normalnie, fajne kolczyki chcę tool_calls: [{"id":"call_1","type":"function","function":{"name":"search_catalog","arguments":"{\\"catalog\\": {\\"query\\": \\"kolczyki\\"}}"}}]';
    expect(stripLeakedToolCallsLiterals(raw).trim()).toBe('normalnie, fajne kolczyki chcę');
  });

  it('leaves plain assistant text unchanged', () => {
    const t = 'Polecam Pani kolczyki z kolekcji Aura.';
    expect(stripLeakedToolCallsLiterals(t)).toBe(t);
  });
});
