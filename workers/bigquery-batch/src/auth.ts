// ============================================================================
// Google Auth helpers – pure/crypto utilities for JWT generation
// Extracted for testability.
// ============================================================================

/**
 * Base64URL-encode a plain string (UTF-8 safe via btoa).
 * Replaces + → -, / → _, strips trailing =.
 */
export const base64UrlEncode = (str: string): string =>
  btoa(str).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');

/**
 * Parse a PEM-encoded PKCS#8 private key string into an ArrayBuffer.
 */
export function str2ab(str: string): ArrayBuffer {
  const pemHeader = '-----BEGIN PRIVATE KEY-----';
  const pemFooter = '-----END PRIVATE KEY-----';
  const pemContents = str
    .substring(pemHeader.length, str.length - pemFooter.length)
    .replace(/\s/g, '');
  const binaryDerString = atob(pemContents);
  const binaryDer = new Uint8Array(binaryDerString.length);
  for (let i = 0; i < binaryDerString.length; i++) {
    binaryDer[i] = binaryDerString.charCodeAt(i);
  }
  return binaryDer.buffer;
}
