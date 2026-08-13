import type { Env } from '../config/bindings';

export type EmailAttachment = {
  filename: string;
  contentBase64: string;
  contentType: string;
};

export type TransactionalEmailArgs = {
  fromEmail: string;
  fromName: string;
  toEmail: string;
  subject: string;
  html: string;
  replyToEmail?: string;
  replyToName?: string;
  attachments?: EmailAttachment[];
  kind: 'studio' | 'customer';
};

function formatFromAddress(email: string, name: string): string {
  return `${name} <${email}>`;
}

export async function sendTransactionalEmail(env: Env, args: TransactionalEmailArgs): Promise<boolean> {
  const apiKey = env.RESEND_API_KEY?.trim();
  if (!apiKey) {
    console.warn('[cocreate] RESEND_API_KEY not set — e-mail pominięty', { kind: args.kind });
    return false;
  }

  const body: Record<string, unknown> = {
    from: formatFromAddress(args.fromEmail, args.fromName),
    to: [args.toEmail],
    subject: args.subject,
    html: args.html,
  };

  if (args.replyToEmail) {
    body.reply_to = args.replyToName
      ? formatFromAddress(args.replyToEmail, args.replyToName)
      : args.replyToEmail;
  }

  if (args.attachments && args.attachments.length > 0) {
    body.attachments = args.attachments.map((a) => ({
      filename: a.filename,
      content: a.contentBase64,
      content_type: a.contentType,
    }));
  }

  const res = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(body),
  });

  const text = await res.text().catch(() => '');
  if (!res.ok) {
    console.error('[cocreate] resend failed', {
      kind: args.kind,
      status: res.status,
      bodyPreview: text.slice(0, 300),
    });
    return false;
  }

  return true;
}
