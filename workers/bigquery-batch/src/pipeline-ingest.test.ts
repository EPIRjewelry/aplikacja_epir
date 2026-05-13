import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { postPipelineIngestBatch } from './pipeline-ingest';

describe('postPipelineIngestBatch', () => {
  beforeEach(() => {
    vi.stubGlobal('fetch', vi.fn());
  });
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('no-op when URL missing', async () => {
    const r = await postPipelineIngestBatch(undefined, undefined, [{ a: 1 }]);
    expect(r).toEqual({ ok: true });
    expect(fetch).not.toHaveBeenCalled();
  });

  it('no-op when records empty', async () => {
    const r = await postPipelineIngestBatch('https://x.ingest.cloudflare.com', 't', []);
    expect(r).toEqual({ ok: true });
    expect(fetch).not.toHaveBeenCalled();
  });

  it('POSTs JSON array with optional Bearer', async () => {
    vi.mocked(fetch).mockResolvedValueOnce(new Response('ok', { status: 200 }));
    const r = await postPipelineIngestBatch('https://abc.ingest.cloudflare.com', 'secret', [{ x: 1 }]);
    expect(r).toEqual({ ok: true });
    expect(fetch).toHaveBeenCalledWith(
      'https://abc.ingest.cloudflare.com',
      expect.objectContaining({
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: 'Bearer secret' },
        body: '[{"x":1}]',
      }),
    );
  });

  it('returns error on non-2xx', async () => {
    vi.mocked(fetch).mockResolvedValueOnce(new Response('bad', { status: 401 }));
    const r = await postPipelineIngestBatch('https://abc.ingest.cloudflare.com', undefined, [{ x: 1 }]);
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.status).toBe(401);
      expect(r.body).toBe('bad');
    }
  });
});
