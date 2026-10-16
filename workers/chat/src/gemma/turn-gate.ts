import type {Env} from '../config/bindings';

export async function withBuyerTurnGate<T>(
  env: Env,
  sessionId: string,
  turnId: string,
  fn: () => Promise<T>,
): Promise<T> {
  const sid = sessionId.trim();
  if (!sid || !env.SESSION_DO) {
    return fn();
  }
  const stub = env.SESSION_DO.get(env.SESSION_DO.idFromName(sid));
  await stub.fetch('https://session/begin-buyer-turn', {
    method: 'POST',
    headers: {'Content-Type': 'application/json'},
    body: JSON.stringify({turn_id: turnId}),
  });
  try {
    return await fn();
  } finally {
    await stub.fetch('https://session/end-buyer-turn', {
      method: 'POST',
      headers: {'Content-Type': 'application/json'},
      body: JSON.stringify({turn_id: turnId}),
    });
  }
}
