import type { Env } from '../config/bindings';
import type { CocreatePersistedBrief } from './types';

export async function insertCocreateBrief(env: Env, row: CocreatePersistedBrief): Promise<void> {
  if (!env.DB_CHATBOT) {
    throw new Error('DB_CHATBOT binding missing');
  }

  await env.DB_CHATBOT.prepare(
    `INSERT INTO cocreate_briefs (
      reference_id, created_at, storefront_id, channel, shop_domain, source_url, status,
      name, email, email_hash, phone, vision, brief_json,
      r2_key, r2_content_type, r2_bytes,
      consent_project, consent_marketing, user_agent_trunc
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  )
    .bind(
      row.referenceId,
      row.createdAt,
      row.storefrontId,
      row.channel,
      row.shopDomain,
      row.sourceUrl,
      'new',
      row.name,
      row.email,
      row.emailHash,
      row.phone,
      row.vision,
      row.briefJson,
      row.r2Key,
      row.r2ContentType,
      row.r2Bytes,
      row.consentProject ? 1 : 0,
      row.consentMarketing ? 1 : 0,
      row.userAgentTrunc,
    )
    .run();
}

export async function putCocreateUpload(
  env: Env,
  key: string,
  bytes: Uint8Array,
  contentType: string,
): Promise<void> {
  if (!env.COCREATE_UPLOADS) {
    throw new Error('COCREATE_UPLOADS binding missing');
  }
  await env.COCREATE_UPLOADS.put(key, bytes, {
    httpMetadata: { contentType },
    customMetadata: { purpose: 'cocreate-brief' },
  });
}

export function buildR2Key(args: {
  storefrontId: string;
  referenceId: string;
  fileName: string;
  contentType: 'image/jpeg' | 'image/png';
}): string {
  const ext = args.contentType === 'image/png' ? 'png' : 'jpg';
  const now = new Date();
  const y = now.getUTCFullYear();
  const m = String(now.getUTCMonth() + 1).padStart(2, '0');
  const safeName = args.fileName.replace(/[^\w.\-]+/g, '_').slice(0, 80) || `upload.${ext}`;
  return `${args.storefrontId}/${y}/${m}/${args.referenceId}/${safeName}`;
}
