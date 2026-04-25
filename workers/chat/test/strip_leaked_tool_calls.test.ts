import { describe, it, expect } from 'vitest';
import {
  stripLeakedToolCallsLiterals,
  containsLikelyToolMarkupLeak,
} from '../src/utils/stripLeakedToolCallsLiterals';

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

  it('strips [Tool calls] bracket section and following JSON array', () => {
    const raw =
      'Niestety problem. [Tool calls]\n[{"id":"x","type":"function","function":{"name":"search_catalog","arguments":"{}"}}]\nDziękuję.';
    const out = stripLeakedToolCallsLiterals(raw).replace(/\s+/g, ' ').trim();
    expect(out).not.toMatch(/Tool calls/i);
    expect(out).not.toMatch(/search_catalog/);
    expect(out).toContain('Niestety');
    expect(out).toContain('Dziękuję');
  });

  it('containsLikelyToolMarkupLeak detects Tool calls heading', () => {
    expect(containsLikelyToolMarkupLeak('Hello [Tool calls] there')).toBe(true);
    expect(containsLikelyToolMarkupLeak('Plain polish answer.')).toBe(false);
  });

  it('strips Kimi redacted tool markers and functions.* leaks', () => {
    const raw =
      'Cześć <|tool_calls_section_begin|> <|tool_call_begin|> functions.update_cart:0 <|tool_call_end|> oto propozycja.';
    const out = stripLeakedToolCallsLiterals(raw).replace(/\s+/g, ' ').trim();
    expect(out).not.toMatch(/redacted_tool/i);
    expect(out).not.toMatch(/functions\.update_cart/i);
    expect(out).toContain('Cześć');
    expect(out).toContain('propozycja');
  });
});
