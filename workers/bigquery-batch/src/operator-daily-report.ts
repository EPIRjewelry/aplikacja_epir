/**
 * Dzienny raport operatora (Project B) — EDOG + Q8 + marketing preview → D1.
 */
import type { FlowHealthReport } from './edog-flow-health-runner';
import { buildFlowHealthReport } from './edog-flow-health-runner';
import { buildEdogNarrative } from './edog-reason-narrative';
import { buildGemmaDigestMarkdown, fetchGemmaConversations24h } from './operator-gemma-digest';
import { sendOperatorReportEmail } from './operator-report-email';
import { sanitizeReportForWorkspaceExport } from './report-pii-mask';
import { since24hMs } from './edog-flow-health';

export type OperatorReportEnv = {
  DB_CHATBOT: D1Database;
  MARKETING_INGEST_RPC?: {
    getMarketingPreview(args?: { date?: string }): Promise<Record<string, unknown>>;
  };
  GWORKSPACE_REPORT_WEBHOOK_URL?: string;
  OPERATOR_REPORT_EMAIL_TO?: string;
  OPERATOR_REPORT_EMAIL_FROM?: string;
};

type Q1Probe = (env: OperatorReportEnv) => Promise<{
  rowCount: number | null;
  skipped: boolean;
  error?: string;
}>;

type AnalyticsEnv = Parameters<typeof buildFlowHealthReport>[0];
type AnalyticsProbe = Parameters<typeof buildFlowHealthReport>[1];

export async function fetchMarketingPreviewSnippet(env: OperatorReportEnv): Promise<string> {
  const rpc = env.MARKETING_INGEST_RPC;
  if (!rpc?.getMarketingPreview) {
    return '_Marketing preview: brak bindingu MARKETING_INGEST_RPC na batch workerze._';
  }
  try {
    const json = await rpc.getMarketingPreview();
    return `_Marketing preview (RPC):_\n\`\`\`json\n${JSON.stringify(json).slice(0, 6000)}\n\`\`\``;
  } catch (e) {
    return `_Marketing preview error: ${e instanceof Error ? e.message : String(e)}_`;
  }
}

export function buildOperatorReportMarkdown(args: {
  reportDate: string;
  health: FlowHealthReport;
  q8Rows: Record<string, unknown>[] | null;
  q8Error?: string;
  marketingSection: string;
  gemmaSection: string;
  exportCatchUpNote?: string;
}): string {
  const { reportDate, health, q8Rows, q8Error, marketingSection, gemmaSection, exportCatchUpNote } = args;
  const narrative = buildEdogNarrative(health);
  const lines: string[] = [
    `# Raport EPIR — ${reportDate}`,
    '',
    narrative.markdown,
  ];
  if (exportCatchUpNote) {
    lines.push('', '### Eksport D1→hurtownia (automatyczny)', '', exportCatchUpNote);
  }
  lines.push('', gemmaSection, '', '## Hurtownia Q8 (dzienne zdarzenia)');
  if (q8Error) {
    lines.push(`_Błąd Q8: ${q8Error}_`);
  } else if (q8Rows?.length) {
    lines.push('```json', JSON.stringify(q8Rows.slice(0, 14), null, 2), '```');
  } else {
    lines.push('_Brak wierszy Q8._');
  }
  lines.push('', '## Marketing', marketingSection);
  lines.push('', '---', '_Wygenerowano automatycznie przez epir-bigquery-batch (cron raportu operatora)._');
  return lines.join('\n');
}

export async function persistOperatorDailyReport(
  env: OperatorReportEnv,
  reportDate: string,
  markdown: string,
  edogVerdict: string,
): Promise<void> {
  const now = Date.now();
  await env.DB_CHATBOT.prepare(
    `INSERT INTO operator_daily_reports (report_date, markdown_body, edog_verdict, created_at)
     VALUES (?1, ?2, ?3, ?4)
     ON CONFLICT(report_date) DO UPDATE SET
       markdown_body = excluded.markdown_body,
       edog_verdict = excluded.edog_verdict,
       created_at = excluded.created_at`,
  )
    .bind(reportDate, markdown, edogVerdict, now)
    .run();
}

export type WorkspaceReportWebhookPayload = {
  title: string;
  body: string;
  piiMasked: true;
  exportedAt: string;
  ssot: 'd1_operator_daily_reports';
  emailTo?: string;
};

export async function postReportToWorkspaceWebhook(env: OperatorReportEnv, markdown: string): Promise<void> {
  const url = (env.GWORKSPACE_REPORT_WEBHOOK_URL ?? '').trim();
  if (!url) return;
  const body = await sanitizeReportForWorkspaceExport(markdown);
  const emailTo = (env.OPERATOR_REPORT_EMAIL_TO ?? '').trim();
  const payload: WorkspaceReportWebhookPayload = {
    title: `EPIR Raport ${new Date().toISOString().slice(0, 10)}`,
    body,
    piiMasked: true,
    exportedAt: new Date().toISOString(),
    ssot: 'd1_operator_daily_reports',
    ...(emailTo ? { emailTo } : {}),
  };
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
  if (!res.ok) {
    console.warn('[operator-report] webhook failed:', res.status, await res.text().catch(() => ''));
  }
}

export async function runOperatorDailyReport(
  env: OperatorReportEnv,
  probeQ1: Q1Probe,
  runQ8: (env: AnalyticsEnv) => Promise<
    | { ok: true; rows: Record<string, unknown>[] }
    | { ok: false; error: string }
  >,
  opts?: {
    exportCatchUpNote?: string;
  },
): Promise<void> {
  const reportDate = new Date().toISOString().slice(0, 10);
  const sinceMs = since24hMs(Date.now());
  const health = await buildFlowHealthReport(env as AnalyticsEnv, probeQ1 as AnalyticsProbe);

  const gemmaRows = await fetchGemmaConversations24h(env, sinceMs, 20);
  const gemmaSection = buildGemmaDigestMarkdown(gemmaRows, reportDate);

  let q8Rows: Record<string, unknown>[] | null = null;
  let q8Error: string | undefined;
  if (health.edog_verdict === 'PASS') {
    const q8 = await runQ8(env as AnalyticsEnv);
    if (q8.ok) q8Rows = q8.rows;
    else q8Error = q8.error;
  } else {
    q8Error = 'Pominięto Q8 — EDOG nie PASS';
  }

  const marketingSection = await fetchMarketingPreviewSnippet(env);
  const markdown = buildOperatorReportMarkdown({
    reportDate,
    health,
    q8Rows,
    q8Error,
    marketingSection,
    gemmaSection,
    exportCatchUpNote: opts?.exportCatchUpNote,
  });

  await persistOperatorDailyReport(env, reportDate, markdown, health.edog_verdict);

  const emailResult = await sendOperatorReportEmail(
    env,
    `EPIR Raport ${reportDate} — EDOG ${health.edog_verdict}`,
    await sanitizeReportForWorkspaceExport(markdown),
  );
  if (emailResult.error) {
    console.warn('[operator-report] email failed:', emailResult.error);
  } else if (emailResult.sent) {
    console.log('[operator-report] email sent');
  }

  await postReportToWorkspaceWebhook(env, markdown);
  console.log('[operator-report] saved', reportDate, health.edog_verdict);
}
