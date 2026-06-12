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
    expect(text).toContain('id="workflow"');
    expect(text).toContain('WORKFLOWS');
    expect(text).toContain('btn-dl');
    expect(text).toContain('Operator Studio');
  });

  it('returns HTML or build hint for GET /internal/operator-studio', async () => {
    const env = { EPIR_OPERATOR_PANEL_SECRET: 'op' } as unknown as Env;
    const res = await worker.fetch(
      new Request('https://asystent.test/internal/operator-studio', { method: 'GET' }),
      env,
      noopCtx,
    );
    const text = await res.text();
    expect(text).toContain('Operator Studio');
    expect([200, 503]).toContain(res.status);
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

  it('returns 401 for GET openrouter-models without X-Admin-Key', async () => {
    const env = { EPIR_OPERATOR_PANEL_SECRET: 'good' } as unknown as Env;
    const res = await worker.fetch(
      new Request('https://asystent.test/internal/solo-dev-chat/api/openrouter-models', {
        method: 'GET',
      }),
      env,
      noopCtx,
    );
    expect(res.status).toBe(401);
  });

  it('GET /api/ready does not require EPIR_CHAT_SHARED_SECRET (operator key only)', async () => {
    const env = { EPIR_OPERATOR_PANEL_SECRET: 'good' } as unknown as Env;
    const res = await worker.fetch(
      new Request('https://asystent.test/internal/solo-dev-chat/api/ready', {
        method: 'GET',
        headers: { 'X-Admin-Key': 'good' },
      }),
      env,
      noopCtx,
    );
    expect(res.status).toBe(200);
    const body = (await res.json()) as {
      ok?: boolean;
      gates?: { operatorPanelSecret?: boolean; chatSharedSecret?: boolean };
      note?: string;
    };
    expect(body.ok).toBe(true);
    expect(body.gates?.operatorPanelSecret).toBe(true);
    expect(body.gates?.chatSharedSecret).toBe(false);
    expect(body.note).toContain('EPIR_OPERATOR_PANEL_SECRET');
  });

  it('GET reports returns 503 when DB_CHATBOT missing', async () => {
    const env = { EPIR_OPERATOR_PANEL_SECRET: 'good' } as unknown as Env;
    const res = await worker.fetch(
      new Request('https://asystent.test/internal/operator-studio/api/reports?limit=5', {
        method: 'GET',
        headers: { 'X-Admin-Key': 'good' },
      }),
      env,
      noopCtx,
    );
    expect(res.status).toBe(503);
    const body = (await res.json()) as { ok?: boolean; error?: string };
    expect(body.ok).toBe(false);
    expect(body.error).toBe('db_not_configured');
  });

  it('GET /internal/operator-studio/api/operator-report/latest aliases correctly', async () => {
    const db = {
      prepare(_sql: string) {
        return {
          bind() {
            return this;
          },
          async first() {
            return {
              report_date: '2026-06-07',
              markdown_body: '# Daily',
              edog_verdict: 'PASS',
              created_at: 1,
            };
          },
        };
      },
    };
    const env = {
      EPIR_OPERATOR_PANEL_SECRET: 'good',
      DB_CHATBOT: db,
    } as unknown as Env;
    const res = await worker.fetch(
      new Request('https://asystent.test/internal/operator-studio/api/operator-report/latest', {
        method: 'GET',
        headers: { 'X-Admin-Key': 'good' },
      }),
      env,
      noopCtx,
    );
    expect(res.status).toBe(200);
    const body = (await res.json()) as { ok?: boolean; report?: { report_date: string } };
    expect(body.ok).toBe(true);
    expect(body.report?.report_date).toBe('2026-06-07');
  });

  it('GET /internal/operator-studio/api/reports lists operator_daily_reports', async () => {
    const db = {
      prepare(_sql: string) {
        return {
          bind() {
            return this;
          },
          async all() {
            return {
              results: [
                {
                  report_date: '2026-06-07',
                  markdown_body: '# Daily report',
                  edog_verdict: 'PASS',
                  created_at: 1,
                },
              ],
            };
          },
        };
      },
    };
    const env = {
      EPIR_OPERATOR_PANEL_SECRET: 'good',
      DB_CHATBOT: db,
    } as unknown as Env;
    const res = await worker.fetch(
      new Request('https://asystent.test/internal/operator-studio/api/reports?limit=5', {
        method: 'GET',
        headers: { 'X-Admin-Key': 'good' },
      }),
      env,
      noopCtx,
    );
    expect(res.status).toBe(200);
    const body = (await res.json()) as {
      ok?: boolean;
      reports?: { report_date: string; edog_verdict: string }[];
    };
    expect(body.ok).toBe(true);
    expect(body.reports).toHaveLength(1);
    expect(body.reports?.[0]?.report_date).toBe('2026-06-07');
  });

  it('returns 503 for openrouter-models when OPENROUTER_API_KEY missing', async () => {
    const env = { EPIR_OPERATOR_PANEL_SECRET: 'good' } as unknown as Env;
    const res = await worker.fetch(
      new Request('https://asystent.test/internal/solo-dev-chat/api/openrouter-models', {
        method: 'GET',
        headers: { 'X-Admin-Key': 'good' },
      }),
      env,
      noopCtx,
    );
    expect(res.status).toBe(503);
    const body = (await res.json()) as { error?: string };
    expect(body.error).toBe('openrouter_not_configured');
  });
});
