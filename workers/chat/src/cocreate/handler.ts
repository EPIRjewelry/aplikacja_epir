import type { Env } from '../config/bindings';
import { checkRateLimit } from '../rate-limiter';
import { emitCocreateSubmittedEvent } from './analytics';
import { notifyCocreateBrief } from './notify';
import { parseCocreateFormData } from './parse';
import { buildR2Key, insertCocreateBrief, putCocreateUpload } from './persist';
import type { CocreatePersistedBrief } from './types';
import {
  buildReferenceId,
  readUploadBase64,
  readUploadFile,
  sha256Hex,
  truncateUserAgent,
  trimField,
  FIELD_LIMITS,
} from './utils';

const APP_PROXY_STOREFRONT_ID = 'online-store';
const APP_PROXY_CHANNEL = 'online-store';

function cocreateCors(env: Env, request?: Request): Record<string, string> {
  const requestOrigin = request?.headers.get('Origin');
  const allowedOrigins = (env.ALLOWED_ORIGINS || env.ALLOWED_ORIGIN || '')
    .split(',')
    .map((o) => o.trim())
    .filter(Boolean);

  let allowOrigin = '*';
  if (requestOrigin && allowedOrigins.length > 0) {
    if (allowedOrigins.includes(requestOrigin)) {
      allowOrigin = requestOrigin;
    }
  } else if (!requestOrigin && allowedOrigins.length === 1 && allowedOrigins[0] !== '*') {
    allowOrigin = allowedOrigins[0];
  }

  return {
    'Access-Control-Allow-Origin': allowOrigin,
    'Access-Control-Allow-Methods': 'POST,OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
  };
}

function jsonResponse(
  env: Env,
  request: Request,
  status: number,
  body: Record<string, unknown>,
): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      'Content-Type': 'application/json',
      ...cocreateCors(env, request),
    },
  });
}

export async function handleCocreateAppProxy(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
  if (request.method === 'OPTIONS') {
    return new Response(null, { status: 204, headers: cocreateCors(env, request) });
  }

  if (request.method !== 'POST') {
    return jsonResponse(env, request, 405, { ok: false, error: 'method_not_allowed' });
  }

  if (!env.DB_CHATBOT) {
    return jsonResponse(env, request, 500, { ok: false, error: 'server_misconfigured' });
  }

  const url = new URL(request.url);
  const shop = url.searchParams.get('shop')?.trim() || env.SHOP_DOMAIN || 'unknown-shop';
  const rl = await checkRateLimit(`epir:cocreate:${shop}`, env, 2);
  if (!rl.allowed) {
    const retrySec = rl.retryAfterMs && rl.retryAfterMs > 0 ? Math.max(1, Math.ceil(rl.retryAfterMs / 1000)) : 60;
    return jsonResponse(env, request, 429, {
      ok: false,
      error: 'rate_limited',
      retry_after_seconds: retrySec,
    });
  }

  let formData: FormData;
  try {
    formData = await request.formData();
  } catch {
    return jsonResponse(env, request, 400, { ok: false, error: 'invalid_multipart' });
  }

  const parsed = parseCocreateFormData(formData);
  if (!parsed.ok) {
    return jsonResponse(env, request, 400, { ok: false, error: 'validation_failed', message: parsed.message });
  }

  const uploadEntry = formData.get('attachment');
  const uploadFile = uploadEntry instanceof File && uploadEntry.size > 0 ? uploadEntry : null;
  const uploadBase64 = typeof formData.get('attachment_base64') === 'string'
    ? String(formData.get('attachment_base64')).trim()
    : '';
  const uploadFileNameHint = trimField(formData.get('attachment_filename'), FIELD_LIMITS.MAX_NAME);

  let uploadBytes: Uint8Array | null = null;
  let uploadContentType: 'image/jpeg' | 'image/png' | null = null;
  let uploadFileName = 'upload.jpg';

  if (uploadFile || uploadBase64) {
    if (!env.COCREATE_UPLOADS) {
      return jsonResponse(env, request, 503, { ok: false, error: 'upload_unavailable' });
    }
    const upload = uploadFile
      ? await readUploadFile(uploadFile)
      : readUploadBase64(uploadBase64, uploadFileNameHint);
    if (!upload.ok) {
      return jsonResponse(env, request, 400, { ok: false, error: 'validation_failed', message: upload.message });
    }
    uploadBytes = upload.bytes;
    uploadContentType = upload.contentType;
    uploadFileName = upload.fileName;
  }

  const referenceId = buildReferenceId();
  const createdAt = Date.now();
  const fields = parsed.fields;
  const briefJson = JSON.stringify({
    jewelryType: fields.jewelryType,
    metal: fields.metal,
    stone: fields.stone,
    occasion: fields.occasion,
    budgetBand: fields.budgetBand,
    timeline: fields.timeline,
    ringSize: fields.ringSize,
    consentMarketing: fields.consentMarketing,
  });

  let r2Key: string | null = null;
  let r2ContentType: string | null = null;
  let r2Bytes: number | null = null;

  if (uploadBytes && uploadContentType && env.COCREATE_UPLOADS) {
    r2Key = buildR2Key({
      storefrontId: APP_PROXY_STOREFRONT_ID,
      referenceId,
      fileName: uploadFileName,
      contentType: uploadContentType,
    });
    r2ContentType = uploadContentType;
    r2Bytes = uploadBytes.length;
    await putCocreateUpload(env, r2Key, uploadBytes, uploadContentType);
  }

  const row: CocreatePersistedBrief = {
    ...fields,
    referenceId,
    createdAt,
    storefrontId: APP_PROXY_STOREFRONT_ID,
    channel: APP_PROXY_CHANNEL,
    shopDomain: shop,
    emailHash: await sha256Hex(fields.email),
    briefJson,
    r2Key,
    r2ContentType,
    r2Bytes,
    userAgentTrunc: truncateUserAgent(request.headers.get('User-Agent')),
  };

  try {
    await insertCocreateBrief(env, row);
  } catch (error) {
    console.error('[cocreate] insert failed', error);
    return jsonResponse(env, request, 500, { ok: false, error: 'persist_failed' });
  }

  ctx.waitUntil(
    Promise.all([
      notifyCocreateBrief(env, row).catch((e) => console.error('[cocreate] notify failed', e)),
      emitCocreateSubmittedEvent(env, row),
    ]),
  );

  return jsonResponse(env, request, 201, {
    ok: true,
    referenceId,
    message: 'Brief został przyjęty. Odezwiemy się w ciągu 2–3 dni roboczych.',
  });
}
