import { afterEach, describe, expect, it, vi } from 'vitest';
import { postReportToWorkspaceWebhook } from './operator-daily-report';

describe('postReportToWorkspaceWebhook', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it('no-ops when GWORKSPACE_REPORT_WEBHOOK_URL is unset', async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
    await postReportToWorkspaceWebhook({ DB_CHATBOT: {} as D1Database }, '# Raport');
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('POSTs masked payload with metadata when URL is set', async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response('ok', { status: 200 }));
    vi.stubGlobal('fetch', fetchMock);

    await postReportToWorkspaceWebhook(
      {
        DB_CHATBOT: {} as D1Database,
        GWORKSPACE_REPORT_WEBHOOK_URL: 'https://script.google.com/macros/s/test/exec',
      },
      '# Raport\n\nemail: User.A.B@gmail.com',
    );

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toContain('script.google.com');
    expect(init.method).toBe('POST');
    const body = JSON.parse(String(init.body)) as {
      title: string;
      body: string;
      piiMasked: boolean;
      exportedAt: string;
      ssot: string;
    };
    expect(body.piiMasked).toBe(true);
    expect(body.ssot).toBe('d1_operator_daily_reports');
    expect(body.body).not.toContain('User.A.B@gmail.com');
    expect(body.body).not.toContain('userab@gmail.com');
    expect(body.body).toContain('sha256:');
  });

  it('logs non-2xx without throwing', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response('fail', { status: 500 })));

    await postReportToWorkspaceWebhook(
      {
        DB_CHATBOT: {} as D1Database,
        GWORKSPACE_REPORT_WEBHOOK_URL: 'https://script.google.com/macros/s/test/exec',
      },
      '# Raport',
    );

    expect(warn).toHaveBeenCalled();
  });
});
