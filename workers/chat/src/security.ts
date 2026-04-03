// Przykład: worker/src/security.ts
// Funkcja weryfikująca HMAC przychodzący przez App Proxy.
// Uwaga: dostosuj nazwy headerów/parametrów do finalnej specyfikacji projektu.
// Nie umieszczaj tajnych kluczy w kodzie — używaj ENV (wrangler secrets).

import { verifyHmac, shopifyAppProxyCanonicalString, verifyTimestamp } from './hmac';

export async function verifyAppProxyHmac(request: Request<any, any>, secret: string): Promise<{ ok: boolean; reason?: string }> {
  try {
    const url = new URL(request.url);
    const querySig =
      url.searchParams.get('signature') ?? url.searchParams.get('hmac') ?? undefined;
    const headerSig = request.headers.get('x-shopify-hmac-sha256') ?? undefined;

    // Shopify App Proxy: `signature` (hex) w query — HMAC tylko nad parametrami URL, bez body.
    // Nagłówek X-Shopify-Hmac-Sha256: używany w testach / niestandardowych klientach — message = canonical + raw body.
    const signatureRaw = querySig ?? headerSig;
    if (!signatureRaw) return { ok: false, reason: 'missing_signature' };

    const tsParam = url.searchParams.get('timestamp');
    if (tsParam) {
      const ts = Number(tsParam);
      if (!Number.isFinite(ts) || ts <= 0) {
        return { ok: false, reason: 'invalid_timestamp' };
      }
      const isValid = verifyTimestamp(ts, 300);
      if (!isValid) {
        return { ok: false, reason: 'timestamp_out_of_range' };
      }
    }

    const canonical = shopifyAppProxyCanonicalString(url.searchParams);

    let message: string;
    if (querySig) {
      message = canonical;
    } else {
      const cloned = request.clone();
      const bodyBuffer = await cloned.arrayBuffer();
      const bodyStr = new TextDecoder().decode(bodyBuffer);
      message = canonical + bodyStr;
    }

    const verified = await verifyHmac(signatureRaw, secret, message);

    if (!verified) {
      console.error('HMAC verification failed: invalid');
      return { ok: false, reason: 'hmac_mismatch' };
    }

    return { ok: true };
  } catch (err) {
    console.error('verifyAppProxyHmac error', (err as Error).message);
    return { ok: false, reason: 'internal_error' };
  }
}

/**
 * Funkcja do sprawdzania replay attack poprzez Durable Object.
 * Wywołuje DO SessionDO z endpointem '/replay-check'.
 * @param sessionDo DurableObjectStub dla sesji
 * @param signature Podpis do sprawdzenia
 * @param timestamp Timestamp z requestu
 * @returns Promise<{ok: boolean, reason?: string}>
 */
export async function replayCheck(
  sessionDo: DurableObjectStub,
  signature: string,
  timestamp: string
): Promise<{ ok: boolean; reason?: string }> {
  try {
    const response = await sessionDo.fetch('/replay-check', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ signature, timestamp }),
    });
    if (!response.ok) {
      return { ok: false, reason: `DO error: ${response.status}` };
    }
    const data = await response.json() as { used?: boolean; error?: string };
    if (data.error) return { ok: false, reason: data.error };
    if (data.used) return { ok: false, reason: 'signature_already_used' };
    return { ok: true };
  } catch (err) {
    console.error('replayCheck error', (err as Error).message);
    return { ok: false, reason: 'internal_error' };
  }
}