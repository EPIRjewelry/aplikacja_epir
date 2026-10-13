import { AiGatewayHttpError } from '../ai-client';

export const BUYER_LLM_OVERLOAD_MESSAGE =
  'Mamy chwilowe przeciążenie i nie udało się odpowiedzieć. Proszę spróbować ponownie za minutę.';

export class BuyerTurnOverloadError extends Error {
  constructor() {
    super('buyer_turn_overload');
    this.name = 'BuyerTurnOverloadError';
  }
}

function parseGatewayStatusFromMessage(err: unknown): number | null {
  const msg = err instanceof Error ? err.message : String(err);
  const m = msg.match(/AI Gateway (?:streaming )?error: (\d+)/i);
  if (!m) return null;
  const n = Number(m[1]);
  return Number.isFinite(n) ? n : null;
}

function isRetryableLlmHttpStatus(status: number): boolean {
  return status === 429 || status === 503;
}

function isRetryableLlmError(err: unknown): boolean {
  if (err instanceof AiGatewayHttpError) return isRetryableLlmHttpStatus(err.status);
  const status = parseGatewayStatusFromMessage(err);
  return status != null && isRetryableLlmHttpStatus(status);
}

function llmErrorType(status: number | null): string {
  if (status === 429) return '429_rate_limit';
  if (status === 503) return '503_unavailable';
  return 'llm_http_error';
}

function llmRetryDelayMs(err: unknown): number {
  if (err instanceof AiGatewayHttpError && err.retryAfterSec != null) {
    return Math.min(err.retryAfterSec * 1000, 10_000);
  }
  return 3000 + Math.floor(Math.random() * 2000);
}

function logLlmRetry(fields: {
  llm_error_type: string;
  retry_attempts: number;
  retry_success: boolean;
  http_status: number | null;
}): void {
  console.log(JSON.stringify({ tag: 'buyer.llm_retry', ...fields }));
}

/** Jedno ponowienie w rundzie 0 przy 429/503; po nieudanym retry → BuyerTurnOverloadError. */
export async function withLlmRound0Retry<T>(round: number, fn: () => Promise<T>): Promise<T> {
  const maxAttempts = round === 0 ? 2 : 1;
  let lastErr: unknown;
  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    try {
      const out = await fn();
      if (attempt > 0) {
        logLlmRetry({
          llm_error_type: '429_rate_limit',
          retry_attempts: 1,
          retry_success: true,
          http_status: 429,
        });
      }
      return out;
    } catch (err) {
      lastErr = err;
      const status =
        err instanceof AiGatewayHttpError ? err.status : parseGatewayStatusFromMessage(err);
      const retryable = isRetryableLlmError(err);
      if (round === 0 && retryable && attempt === 0) {
        await new Promise((r) => setTimeout(r, llmRetryDelayMs(err)));
        continue;
      }
      if (round === 0 && retryable) {
        logLlmRetry({
          llm_error_type: llmErrorType(status),
          retry_attempts: 1,
          retry_success: false,
          http_status: status,
        });
        throw new BuyerTurnOverloadError();
      }
      throw err;
    }
  }
  throw lastErr;
}
