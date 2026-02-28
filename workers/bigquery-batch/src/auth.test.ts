import { describe, it, expect } from 'vitest';
import { base64UrlEncode, str2ab } from './auth';

describe('base64UrlEncode', () => {
  it('encodes a simple ASCII string', () => {
    // btoa('hello') = 'aGVsbG8='
    // base64url removes trailing '='
    expect(base64UrlEncode('hello')).toBe('aGVsbG8');
  });

  it('replaces + with -', () => {
    // btoa produces '+' for certain byte sequences; verify replacement
    const encoded = base64UrlEncode('{"alg":"RS256","typ":"JWT"}');
    expect(encoded).not.toContain('+');
  });

  it('replaces / with _', () => {
    const encoded = base64UrlEncode('{"alg":"RS256","typ":"JWT"}');
    expect(encoded).not.toContain('/');
  });

  it('strips trailing = padding', () => {
    const encoded = base64UrlEncode('hello');
    expect(encoded).not.toMatch(/=+$/);
  });

  it('encodes JSON JWT header correctly', () => {
    const header = JSON.stringify({ alg: 'RS256', typ: 'JWT' });
    const encoded = base64UrlEncode(header);
    // Verify it is valid base64url (no +, /, or =)
    expect(encoded).toMatch(/^[A-Za-z0-9\-_]+$/);
  });

  it('is idempotent for empty string', () => {
    // btoa('') = '' → no padding to strip
    expect(base64UrlEncode('')).toBe('');
  });
});

describe('str2ab', () => {
  // We create a minimal valid PEM-like string for testing.
  // The actual content does not need to be a real key for parsing tests.
  const fakeBase64 = btoa('fake-binary-data-for-testing');
  const fakePem = `-----BEGIN PRIVATE KEY-----\n${fakeBase64}\n-----END PRIVATE KEY-----`;

  it('returns an ArrayBuffer', () => {
    const result = str2ab(fakePem);
    expect(result).toBeInstanceOf(ArrayBuffer);
  });

  it('returned buffer has correct byte length', () => {
    const result = str2ab(fakePem);
    const bytes = new Uint8Array(result);
    // 'fake-binary-data-for-testing' is 28 chars = 28 bytes when base64-decoded
    expect(bytes.byteLength).toBe(28);
  });

  it('decodes PEM content correctly', () => {
    const result = str2ab(fakePem);
    const bytes = new Uint8Array(result);
    const decoded = String.fromCharCode(...bytes);
    expect(decoded).toBe('fake-binary-data-for-testing');
  });

  it('strips whitespace from PEM content', () => {
    const pemWithSpaces = `-----BEGIN PRIVATE KEY-----\n${fakeBase64.slice(0, 10)} ${fakeBase64.slice(10)}\n-----END PRIVATE KEY-----`;
    // Should not throw
    expect(() => str2ab(pemWithSpaces)).not.toThrow();
  });
});
