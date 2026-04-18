/**
 * Klasyfikator fragmentów rozmowy dla potrzeb pamięci semantycznej.
 *
 * Deterministyczny first-pass (bez LLM) — szybki, tani, bezbłędny pod kątem KB clamp.
 * Bardziej miękką klasyfikację (style/intent/event) robi ekstraktor LLM-owy.
 *
 * @see memory/extractor.ts
 * @see memory/kb-guard.ts
 */

import type { ClassifierInput, ClassifierVerdict } from './types';
import { isCartToolName, isPolicyToolName, isProductToolName, kbGuardCheck } from './kb-guard';

const LOW_SIGNAL_PATTERNS: RegExp[] = [
  /^cześć$/i,
  /^hej$/i,
  /^witaj$/i,
  /^dzień dobry$/i,
  /^dobry wieczór$/i,
  /^(ok|okej|tak|nie)\b/i,
  /^dzięki$/i,
  /^dziękuję$/i,
  /^pamiętasz mnie[?]?$/i,
  /^poznajesz mnie[?]?$/i,
  /^rozpoznajesz mnie[?]?$/i,
];

function isLowSignal(text: string): boolean {
  const t = String(text ?? '').trim();
  if (t.length < 5) return true;
  return LOW_SIGNAL_PATTERNS.some((re) => re.test(t));
}

/**
 * Klasyfikuje pojedynczy fragment z uwzględnieniem kontekstu tury.
 *
 * @param input       wiadomość do klasyfikacji
 * @param ctx         czy w danej turze był wołany tool KB (decyduje o blokadzie asystenta)
 * @returns Verdict: customer_fact_candidate | raw_user_turn | policy_touch | product_touch | ignore
 */
export function classifyFragment(
  input: ClassifierInput,
  ctx: { turnUsedPolicyTool: boolean },
): ClassifierVerdict {
  if (input.role === 'tool') {
    if (isPolicyToolName(input.toolName ?? null)) {
      return { kind: 'policy_touch', toolCallId: input.toolCallId };
    }
    if (isProductToolName(input.toolName ?? null)) {
      return { kind: 'product_touch', toolCallId: input.toolCallId };
    }
    if (isCartToolName(input.toolName ?? null)) {
      return { kind: 'cart_touch', toolCallId: input.toolCallId };
    }
    return { kind: 'ignore', reason: 'non_memory_tool' };
  }

  const guard = kbGuardCheck({
    role: input.role,
    text: input.content,
    turnUsedPolicyTool: ctx.turnUsedPolicyTool,
  });
  if (!guard.allow) {
    return { kind: 'ignore', reason: `kb_guard_${guard.reason}` };
  }

  if (input.role === 'assistant') {
    return { kind: 'ignore', reason: 'assistant_non_indexed' };
  }

  if (input.role === 'user') {
    if (isLowSignal(input.content)) {
      return { kind: 'ignore', reason: 'low_signal' };
    }
    return { kind: 'raw_user_turn', text: input.content };
  }

  return { kind: 'ignore', reason: 'unknown_role' };
}

/**
 * Wybiera tool-call policy w bieżącej turze (np. pośród wielu tool-calls):
 * gdy tak — cała tura jest traktowana jako policy-touch i asystent nie indeksowany.
 */
export function turnUsedPolicyTool(toolCalls: Array<{ name: string }> | undefined): boolean {
  if (!Array.isArray(toolCalls)) return false;
  return toolCalls.some((t) => isPolicyToolName(t?.name));
}
