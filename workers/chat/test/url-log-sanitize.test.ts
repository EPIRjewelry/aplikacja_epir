import {describe, expect, it} from 'vitest';
import {sanitizeUrlForLog} from '../src/buyer/url-log-sanitize';

describe('sanitizeUrlForLog', () => {
  it('never includes cart token or key in serialized log', () => {
    const raw =
      'https://epir-art-silver-jewellery.myshopify.com/cart/c/TOKEN123?key=KEY456';
    const sanitized = sanitizeUrlForLog(raw, 'not_in_allowlist');
    const serialized = JSON.stringify(sanitized);
    expect(serialized).not.toContain('TOKEN123');
    expect(serialized).not.toContain('KEY456');
    expect(sanitized.host).toBe('epir-art-silver-jewellery.myshopify.com');
    expect(sanitized.pathPattern).toBe('/cart/c/:token');
    expect(sanitized.has_query).toBe(true);
  });

  it('marks pipe-joined URLs', () => {
    const raw =
      'https://shop.myshopify.com/cart/c/AAA?key=1|https://shop.myshopify.com/cart/c/BBB';
    const sanitized = sanitizeUrlForLog(raw);
    expect(sanitized.reason).toBe('pipe');
    const serialized = JSON.stringify(sanitized);
    expect(serialized).not.toContain('AAA');
    expect(serialized).not.toContain('BBB');
  });
});
