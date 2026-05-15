import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { postPipelineIngestBatch } from './pipeline-post';

describe('postPipelineIngestBatch', () => {
  beforeEach(() => vi.stubGlobal('fetch', vi.fn()));
  afterEach(() => vi.unstubAllGlobals());

  it('POSTs array to ingest URL', async () => {
    vi.mocked(fetch).mockResolvedValueOnce(new Response('ok', { status: 200 }));
    const r = await postPipelineIngestBatch('https://abc.ingest.cloudflare.com', 'tok', [{ source: 'google_ads' }]);
    expect(r).toEqual({ ok: true });
    expect(fetch).toHaveBeenCalled();
  });
});
