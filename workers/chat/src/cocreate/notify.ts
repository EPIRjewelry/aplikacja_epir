import type { Env } from '../config/bindings';
import { type EmailAttachment, sendTransactionalEmail } from './email-send';
import { notifyCocreateViaShopifyAdmin } from './shopify-notify';
import type { CocreatePersistedBrief } from './types';
import { sanitizeEmailHeader } from './utils';

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function filenameFromR2Key(r2Key: string, contentType: string | null): string {
  const leaf = r2Key.split('/').pop()?.trim();
  if (leaf) return leaf.slice(0, 120);
  return contentType === 'image/png' ? 'inspiracja.png' : 'inspiracja.jpg';
}

function bytesToBase64(bytes: Uint8Array): string {
  // nodejs_compat — Buffer dostępny w Workerze czatu
  return Buffer.from(bytes).toString('base64');
}

async function loadStudioAttachment(env: Env, row: CocreatePersistedBrief): Promise<EmailAttachment | null> {
  if (!row.r2Key || !env.COCREATE_UPLOADS) return null;

  try {
    const obj = await env.COCREATE_UPLOADS.get(row.r2Key);
    if (!obj) {
      console.warn('[cocreate] R2 attachment missing', { referenceId: row.referenceId, r2Key: row.r2Key });
      return null;
    }
    const bytes = new Uint8Array(await obj.arrayBuffer());
    if (bytes.byteLength === 0) return null;

    const contentType =
      row.r2ContentType ||
      obj.httpMetadata?.contentType ||
      (row.r2Key.toLowerCase().endsWith('.png') ? 'image/png' : 'image/jpeg');

    return {
      filename: filenameFromR2Key(row.r2Key, contentType),
      contentBase64: bytesToBase64(bytes),
      contentType,
    };
  } catch (error) {
    console.error('[cocreate] failed to load R2 attachment', error);
    return null;
  }
}

function briefSummaryHtml(row: CocreatePersistedBrief, attached: boolean): string {
  const brief = JSON.parse(row.briefJson) as Record<string, string | boolean | null>;
  const lines: string[] = [
    `<p><strong>Numer sprawy:</strong> ${escapeHtml(row.referenceId)}</p>`,
    `<p><strong>Imię:</strong> ${escapeHtml(row.name)}</p>`,
    `<p><strong>E-mail:</strong> <a href="mailto:${escapeHtml(row.email)}">${escapeHtml(row.email)}</a></p>`,
  ];
  if (row.phone) lines.push(`<p><strong>Telefon:</strong> ${escapeHtml(row.phone)}</p>`);
  if (brief.jewelryType) lines.push(`<p><strong>Typ:</strong> ${escapeHtml(String(brief.jewelryType))}</p>`);
  if (brief.metal) lines.push(`<p><strong>Metal:</strong> ${escapeHtml(String(brief.metal))}</p>`);
  if (brief.stone) lines.push(`<p><strong>Kamień:</strong> ${escapeHtml(String(brief.stone))}</p>`);
  if (brief.occasion) lines.push(`<p><strong>Okazja:</strong> ${escapeHtml(String(brief.occasion))}</p>`);
  if (brief.budgetBand) lines.push(`<p><strong>Budżet:</strong> ${escapeHtml(String(brief.budgetBand))}</p>`);
  if (brief.timeline) lines.push(`<p><strong>Termin:</strong> ${escapeHtml(String(brief.timeline))}</p>`);
  if (brief.ringSize) lines.push(`<p><strong>Rozmiar:</strong> ${escapeHtml(String(brief.ringSize))}</p>`);
  lines.push(`<p><strong>Wizja:</strong><br>${escapeHtml(row.vision).replace(/\n/g, '<br>')}</p>`);
  if (attached) {
    lines.push('<p><strong>Załącznik:</strong> plik w załączeniu tego e-maila.</p>');
  } else if (row.r2Key) {
    lines.push(
      `<p><strong>Załącznik:</strong> zapisany w R2, ale nie udało się dołączyć do maila (<code>${escapeHtml(row.r2Key)}</code>)</p>`,
    );
  }
  if (row.sourceUrl) {
    lines.push(`<p><strong>Źródło:</strong> ${escapeHtml(row.sourceUrl)}</p>`);
  }
  return lines.join('\n');
}

export async function notifyCocreateBrief(env: Env, row: CocreatePersistedBrief): Promise<void> {
  const fromEmail = env.COCREATE_FROM_EMAIL || 'brief@epirbizuteria.pl';
  const notifyEmail = env.COCREATE_NOTIFY_EMAIL?.trim();

  const shopifyPromise = notifyCocreateViaShopifyAdmin(env, row);
  const attachment = await loadStudioAttachment(env, row);

  let studioOk = false;
  if (notifyEmail) {
    const subjectName = sanitizeEmailHeader(row.name);
    studioOk = await sendTransactionalEmail(env, {
      fromEmail,
      fromName: 'EPIR Pracownia',
      toEmail: notifyEmail,
      subject: `[Brief współtworzenia] ${row.referenceId} — ${subjectName}`,
      html: `<h2>Nowy brief współtworzenia</h2>${briefSummaryHtml(row, Boolean(attachment))}`,
      replyToEmail: row.email,
      replyToName: row.name,
      attachments: attachment ? [attachment] : undefined,
      kind: 'studio',
    });
  } else {
    console.warn('[cocreate] COCREATE_NOTIFY_EMAIL not set — studio notification skipped');
  }

  const customerOk = await sendTransactionalEmail(env, {
    fromEmail,
    fromName: 'EPIR Art Jewellery',
    toEmail: row.email,
    subject: `Otrzymaliśmy Twój brief — ${row.referenceId}`,
    html: `
      <p>Dziękujemy, ${escapeHtml(row.name)}!</p>
      <p>Otrzymaliśmy Twój brief współtworzenia. Numer sprawy: <strong>${escapeHtml(row.referenceId)}</strong>.</p>
      <p>Nasz złotnik przejrzy przesłane materiały i odezwie się w ciągu <strong>2–3 dni roboczych</strong>, aby omówić kolejne kroki.</p>
      <p>Pozdrawiamy,<br>EPIR Art Jewellery · Pracownia Wrocław</p>
    `,
    kind: 'customer',
  });

  const shopifyOk = await shopifyPromise;

  if (!studioOk || !customerOk) {
    console.warn('[cocreate] email delivery incomplete', {
      referenceId: row.referenceId,
      studioOk,
      customerOk,
      shopifyOk,
      hasAttachment: Boolean(attachment),
      hint: 'Sprawdź RESEND_API_KEY, weryfikację domeny brief@epirbizuteria.pl oraz Logs w Resend (nie tylko Emails).',
    });
  }

  console.log(JSON.stringify({
    message: 'cocreate_notify_result',
    referenceId: row.referenceId,
    studioOk,
    customerOk,
    shopifyOk,
    hasAttachment: Boolean(attachment),
  }));
}
