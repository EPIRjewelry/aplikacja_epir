import type {Env} from '../config/bindings';

async function postGate(
  stub: DurableObjectStub,
  path: 'begin-buyer-turn' | 'end-buyer-turn',
  turnId: string,
): Promise<void> {
  try {
    await stub.fetch(`https://session/${path}`, {
      method: 'POST',
      headers: {'Content-Type': 'application/json'},
      body: JSON.stringify({turn_id: turnId}),
    });
  } catch (error) {
    // Jak legacy handleChat: awaria bramki nie może zamienić gotowej odpowiedzi w 500.
    console.warn(`[gemma.turn_gate] ${path} failed`, error);
  }
}

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
  await postGate(stub, 'begin-buyer-turn', turnId);
  try {
    return await fn();
  } finally {
    await postGate(stub, 'end-buyer-turn', turnId);
  }
}
