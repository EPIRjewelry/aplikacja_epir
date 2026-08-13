import { describe, expect, it } from 'vitest';
import { sanitizeEmailHeader, readUploadBase64 } from '../src/cocreate/utils';
import { parseCocreateFormData } from '../src/cocreate/parse';

describe('sanitizeEmailHeader', () => {
  it('strips CRLF and control characters', () => {
    expect(sanitizeEmailHeader('Anna\r\nBcc: evil@x.com')).toBe('AnnaBcc: evil@x.com');
    expect(sanitizeEmailHeader('  Jan\x00  ')).toBe('Jan');
  });
});

describe('parseCocreateFormData name sanitization', () => {
  it('rejects name that becomes empty after header sanitization', () => {
    const form = new FormData();
    form.set('name', '\r\n\r\n');
    form.set('email', 'test@example.com');
    form.set('vision', 'Test vision');
    form.set('consent_project', '1');
    const result = parseCocreateFormData(form);
    expect(result.ok).toBe(false);
  });

  it('strips CRLF from valid name', () => {
    const form = new FormData();
    form.set('name', 'Anna\r\nEvil');
    form.set('email', 'test@example.com');
    form.set('vision', 'Test vision');
    form.set('consent_project', '1');
    const result = parseCocreateFormData(form);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.fields.name).toBe('AnnaEvil');
    }
  });
});

describe('readUploadBase64', () => {
  it('decodes valid JPEG bytes', () => {
    const jpegBytes = new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10]);
    const result = readUploadBase64(Buffer.from(jpegBytes).toString('base64'), 'moj-szkic.jpg');
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.contentType).toBe('image/jpeg');
      expect(result.fileName).toBe('moj-szkic.jpg');
      expect(result.bytes.byteLength).toBe(jpegBytes.byteLength);
    }
  });

  it('rejects invalid base64 payload', () => {
    const result = readUploadBase64('not-an-image!!!', 'bad.jpg');
    expect(result.ok).toBe(false);
  });
});
