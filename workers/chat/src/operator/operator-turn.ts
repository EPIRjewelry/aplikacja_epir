/**
 * Ścieżka operatora (etap 1).
 * Zachowanie streamu bez zmian względem dotychczasowego `streamAssistantResponse`
 * dla `isOperatorChannel` — kupujący nie wchodzi do tej funkcji (handleBuyerTurn).
 */
import type {Env} from '../config/bindings';
import {OPERATOR_DEFAULT_MODEL} from './operator-model';
import {resolveOperatorModelOverride} from '../ai-client';
import type {ModelCapabilities} from '../config/model-params';

export {OPERATOR_DEFAULT_MODEL} from './operator-model';

export type OperatorModelResolution = {
  modelId: string;
  variant: ModelCapabilities | null;
};

/**
 * Rozwiązuje model wyłącznie dla operatora. Ścieżka kupującego nie woła tej funkcji.
 */
export async function resolveOperatorTurnModel(
  headers: Headers,
  env: Env,
  opts: {hasImage: boolean},
): Promise<OperatorModelResolution> {
  const variant = await resolveOperatorModelOverride(headers, env, opts);
  return {
    variant,
    modelId: variant?.id ?? OPERATOR_DEFAULT_MODEL,
  };
}
