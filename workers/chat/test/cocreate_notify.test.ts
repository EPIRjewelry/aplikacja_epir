import { afterEach, describe, expect, it, vi } from 'vitest';
import type { Env } from '../src/config/bindings';
import { sendTransactionalEmail } from '../src/cocreate/email-send';
import { notifyCocreateBrief } from '../src/cocreate/notify';
import type { CocreatePersistedBrief } from '../src/cocreate/types';

const sampleRow: CocreatePersistedBrief = {
  referenceId: 'EPIR-2026-ABCD1234',
  createdAt: Date.now(),
  storefrontId: 'online-store',
  channel: 'online-store',
  shopDomain: 'epir-art-silver-jewellery.myshopify.com',
  name: 'Anna',
  email: 'anna@example.com',
  emailHash: 'hash',
  phone: null,
  vision: 'Pierścionek z szafirem',
  briefJson: JSON.stringify({ jewelryType: 'pierścionek', budgetBand: '5-15k' }),
  r2Key: null,
  r2ContentType: null,
  r2Bytes: null,
  consentProject: true,
  consentMarketing: false,
  sourceUrl: 'https://epirbizuteria.pl/pages/zaprojektuj-swoj-model',
  userAgentTrunc: null,
};

function makeEnv(overrides: Partial<Env> = {}): Env {
  return {
    COCREATE_NOTIFY_EMAIL: 'studio@test.local',
    COCREATE_FROM_EMAIL: 'brief@test.local',
    RESEND_API_KEY: 're_test_key',
    ...overrides,
  } as Env;
}

describe('sendTransactionalEmail', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('returns false when RESEND_API_KEY is missing', async () => {
    const result = await sendTransactionalEmail(makeEnv({ RESEND_API_KEY: undefined }), {
      fromEmail: 'brief@test.local',
      fromName: 'EPIR',
      toEmail: 'studio@test.local',
      subject: 'Test',
      html: '<p>Hi</p>',
      kind: 'studio',
    });
    expect(result).toBe(false);
  });

  it('sends Resend payload with reply_to name and attachment', async () => {
    const fetchMock = vi.fn(async () => new Response('{"id":"msg_1"}', { status: 200 }));
    vi.stubGlobal('fetch', fetchMock);

    const ok = await sendTransactionalEmail(makeEnv(), {
      fromEmail: 'brief@test.local',
      fromName: 'EPIR Pracownia',
      toEmail: 'studio@test.local',
      subject: 'Brief',
      html: '<p>Body</p>',
      replyToEmail: 'anna@example.com',
      replyToName: 'Anna',
      attachments: [{
        filename: 'szkic.jpg',
        contentBase64: Buffer.from('fake-image').toString('base64'),
        contentType: 'image/jpeg',
      }],
      kind: 'studio',
    });

    expect(ok).toBe(true);
    expect(fetchMock).toHaveBeenCalledOnce();
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(String(url)).toBe('https://api.resend.com/emails');
    expect(init.headers).toMatchObject({
      Authorization: 'Bearer re_test_key',
    });
    const body = JSON.parse(String(init.body)) as Record<string, unknown>;
    expect(body.from).toBe('EPIR Pracownia <brief@test.local>');
    expect(body.to).toEqual(['studio@test.local']);
    expect(body.reply_to).toBe('Anna <anna@example.com>');
    expect(body.attachments).toEqual([{
      filename: 'szkic.jpg',
      content: Buffer.from('fake-image').toString('base64'),
      content_type: 'image/jpeg',
    }]);
  });

  it('returns false on Resend error response', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response('invalid', { status: 422 })));

    const ok = await sendTransactionalEmail(makeEnv(), {
      fromEmail: 'brief@test.local',
      fromName: 'EPIR',
      toEmail: 'anna@example.com',
      subject: 'Brief',
      html: '<p>Body</p>',
      kind: 'customer',
    });

    expect(ok).toBe(false);
  });
});

describe('notifyCocreateBrief', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it('sends studio and customer emails and always calls Shopify CRM', async () => {
    const fetchMock = vi.fn(async (input: RequestInfo) => {
      const url = String(input);
      if (url.includes('resend.com')) {
        return new Response('{"id":"msg_1"}', { status: 200 });
      }
      return new Response('not found', { status: 404 });
    });
    vi.stubGlobal('fetch', fetchMock);

    const shopifySpy = vi.spyOn(await import('../src/cocreate/shopify-notify'), 'notifyCocreateViaShopifyAdmin')
      .mockResolvedValue(true);

    await notifyCocreateBrief(makeEnv(), sampleRow);

    const resendCalls = fetchMock.mock.calls.filter(([url]) => String(url).includes('resend.com'));
    expect(resendCalls).toHaveLength(2);
    expect(shopifySpy).toHaveBeenCalledOnce();
  });

  it('attaches R2 image to studio email only', async () => {
    const pngBytes = new Uint8Array([137, 80, 78, 71]);
    const env = makeEnv({
      COCREATE_UPLOADS: {
        async get() {
          return {
            httpMetadata: { contentType: 'image/png' },
            async arrayBuffer() {
              return pngBytes.buffer;
            },
          };
        },
      } as unknown as R2Bucket,
    });

    const fetchMock = vi.fn(async () => new Response('{"id":"msg_1"}', { status: 200 }));
    vi.stubGlobal('fetch', fetchMock);
    vi.spyOn(await import('../src/cocreate/shopify-notify'), 'notifyCocreateViaShopifyAdmin')
      .mockResolvedValue(true);

    await notifyCocreateBrief(env, {
      ...sampleRow,
      r2Key: 'online-store/2026/08/EPIR-2026-ABCD1234/szkic.png',
      r2ContentType: 'image/png',
      r2Bytes: pngBytes.byteLength,
    });

    const studioBody = JSON.parse(String(fetchMock.mock.calls[0]![1]!.body)) as {
      attachments?: Array<{ filename: string; content_type: string }>;
    };
    const customerBody = JSON.parse(String(fetchMock.mock.calls[1]![1]!.body)) as {
      attachments?: unknown;
    };
    expect(studioBody.attachments?.[0]?.filename).toBe('szkic.png');
    expect(studioBody.attachments?.[0]?.content_type).toBe('image/png');
    expect(customerBody.attachments).toBeUndefined();
  });
});
