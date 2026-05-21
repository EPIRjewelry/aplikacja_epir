import { describe, expect, it } from 'vitest';
import worker from '../src/index';
import type { Env } from '../src/config/bindings';

const noopCtx = { waitUntil() {} } as unknown as ExecutionContext;

describe('solo dev chat ingress', () => {
  it('returns HTML for GET /internal/solo-dev-chat', async () => {
    const env = { EPIR_OPERATOR_PANEL_SECRET: 'op' } as unknown as Env;
    const res = await worker.fetch(
      new Request('https://asystent.test/internal/solo-dev-chat', { method: 'GET' }),
      env,
      noopCtx,
    );
    expect(res.status).toBe(200);
    const text = await res.text();
    expect(text).toContain('Dev-asystent');
    expect(text).toContain('/internal/solo-dev-chat/api/chat');
    expect(text).toContain('id="agentHint"');
    expect(text).toContain('id="modelHint"');
    expect(text).toContain('AGENT_HINTS');
  });

  it('returns 401 for POST /internal/solo-dev-chat/api/chat without X-Admin-Key', async () => {
    const env = {
      EPIR_OPERATOR_PANEL_SECRET: 'secret',
      EPIR_CHAT_SHARED_SECRET: 'shared-secret',
    } as unknown as Env;
    const res = await worker.fetch(
      new Request('https://asystent.test/internal/solo-dev-chat/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message: 'hi', stream: false }),
      }),
      env,
      noopCtx,
    );
    expect(res.status).toBe(401);
  });

  it('returns 401 for wrong X-Admin-Key', async () => {
    const env = {
      EPIR_OPERATOR_PANEL_SECRET: 'good',
      EPIR_CHAT_SHARED_SECRET: 'shared-secret',
    } as unknown as Env;
    const res = await worker.fetch(
      new Request('https://asystent.test/internal/solo-dev-chat/api/chat', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Admin-Key': 'bad',
        },
        body: JSON.stringify({ message: 'hi', stream: false }),
      }),
      env,
      noopCtx,
    );
    expect(res.status).toBe(401);
  });
});
