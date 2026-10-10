import type { Env } from '../config/bindings';

/**
 * SessionDO cart helpers for buyer turn.
 * Pattern mirrors operator-session-history (idFromName on trimmed session id) — no import from operator/.
 * Never uses the index.ts fallback shard.
 */

function sessionStub(env: Env, sessionId: string): DurableObjectStub {
  const sid = sessionId.trim();
  if (!sid) {
    throw new Error('session_id required for SessionDO cart access');
  }
  return env.SESSION_DO.get(env.SESSION_DO.idFromName(sid));
}

export async function readSessionCartId(env: Env, sessionId: string): Promise<string | null> {
  const sid = sessionId.trim();
  if (!sid || !env.SESSION_DO) return null;
  try {
    const stub = sessionStub(env, sid);
    const res = await stub.fetch('https://session/cart-id');
    if (!res.ok) return null;
    const json = (await res.json().catch(() => null)) as { cart_id?: unknown } | null;
    const cartId = typeof json?.cart_id === 'string' ? json.cart_id.trim() : '';
    return cartId || null;
  } catch (e) {
    console.warn('[buyer.session_cart] read failed', e);
    return null;
  }
}

export async function writeSessionCartId(
  env: Env,
  sessionId: string,
  cartId: string,
): Promise<void> {
  const sid = sessionId.trim();
  const id = cartId.trim();
  if (!sid || !id || !env.SESSION_DO) return;
  try {
    const stub = sessionStub(env, sid);
    await stub.fetch('https://session/set-cart-id', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ cart_id: id }),
    });
  } catch (e) {
    console.warn('[buyer.session_cart] write failed', e);
  }
}
