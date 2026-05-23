import { describe, expect, it } from 'vitest';
import { compressForContext } from '../src/convert/context-window.js';

describe('compressForContext', () => {
  it('passes through short text', () => {
    const r = compressForContext('krótki brief', 1000);
    expect(r.truncated).toBe(false);
    expect(r.text).toBe('krótki brief');
  });

  it('truncates long text with banner', () => {
    const long = 'a'.repeat(5000);
    const r = compressForContext(long, 1000);
    expect(r.truncated).toBe(true);
    expect(r.text).toContain('gworkspace: truncated');
    expect(r.text.length).toBeLessThan(5000);
  });
});
