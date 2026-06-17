/**
 * Dostawa raportu operatora e-mailem (MailChannels — wymaga SPF/DKIM domeny nadawcy).
 */

export type ReportEmailEnv = {
  OPERATOR_REPORT_EMAIL_TO?: string;
  OPERATOR_REPORT_EMAIL_FROM?: string;
};

export async function sendOperatorReportEmail(
  env: ReportEmailEnv,
  subject: string,
  bodyMarkdown: string,
): Promise<{ sent: boolean; error?: string }> {
  const to = (env.OPERATOR_REPORT_EMAIL_TO ?? '').trim();
  if (!to) return { sent: false };

  const from = (env.OPERATOR_REPORT_EMAIL_FROM ?? 'reports@epirbizuteria.pl').trim();
  const plain = bodyMarkdown.length > 120_000 ? `${bodyMarkdown.slice(0, 120_000)}\n\n…(ucięto)` : bodyMarkdown;

  try {
    const res = await fetch('https://api.mailchannels.net/tx/v1/send', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        personalizations: [{ to: [{ email: to }] }],
        from: { email: from, name: 'EPIR Raport dzienny' },
        subject,
        content: [{ type: 'text/plain', value: plain }],
      }),
    });
    if (!res.ok) {
      const errText = await res.text().catch(() => '');
      return { sent: false, error: `MailChannels HTTP ${res.status}: ${errText.slice(0, 200)}` };
    }
    return { sent: true };
  } catch (e) {
    return { sent: false, error: e instanceof Error ? e.message : String(e) };
  }
}
