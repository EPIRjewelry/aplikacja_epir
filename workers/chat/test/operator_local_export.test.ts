import { describe, expect, it, vi, afterEach } from 'vitest';
import {
  exportOperatorSessionToLocalDisk,
  isOperatorExportConfigured,
} from '../src/operator/operator-local-export';
import type { Env } from '../src/config/bindings';

describe('operator-local-export', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('reports not configured without origin', async () => {
    const env = {} as unknown as Env;
    expect(isOperatorExportConfigured(env)).toBe(false);
    const out = await exportOperatorSessionToLocalDisk(env, 'sid-1', 'analyst');
    expect(out.ok).toBe(false);
    if (!out.ok) expect(out.detail).toContain('OPERATOR_EXPORT_ORIGIN');
  });

  it('proxies markdown to export bridge', async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ ok: true, path: 'D:\\EPIR\\operator-studio\\analyst\\x.md' }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      }),
    );
    vi.stubGlobal('fetch', fetchMock);

    const stub = {
      fetch: vi.fn().mockResolvedValue(
        new Response(
          JSON.stringify([
            { role: 'user', content: 'hello' },
            { role: 'assistant', content: 'world' },
          ]),
          { status: 200 },
        ),
      ),
    };
    const env = {
      OPERATOR_EXPORT_ORIGIN: 'https://export.example.com',
      SESSION_DO: {
        idFromName: () => 'do-id',
        get: () => stub,
      },
    } as unknown as Env;

    const out = await exportOperatorSessionToLocalDisk(env, 'sess-abc', 'analyst');
    expect(out.ok).toBe(true);
    if (out.ok) expect(out.path).toContain('analyst');
    expect(fetchMock).toHaveBeenCalledOnce();
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe('https://export.example.com/v1/export/markdown');
    const body = JSON.parse(String(init.body)) as { role: string; markdown: string };
    expect(body.role).toBe('analyst');
    expect(body.markdown).toContain('hello');
  });
});
