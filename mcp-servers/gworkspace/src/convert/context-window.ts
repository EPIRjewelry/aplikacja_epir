/**
 * Ruchome okno kontekstu — kompresja treści zwracanej do modelu (Project B / plan MCP GWorkspace).
 */

export type ContextWindowResult = {
  readonly text: string;
  readonly truncated: boolean;
  readonly originalLength: number;
  readonly maxChars: number;
};

const DEFAULT_MAX_CHARS = 32_000;

export function resolveMaxChars(override?: number): number {
  if (typeof override === 'number' && override > 500) return Math.floor(override);
  const env = process.env.GWORKSPACE_MAX_CHARS?.trim();
  if (env) {
    const n = Number(env);
    if (Number.isFinite(n) && n > 500) return Math.floor(n);
  }
  return DEFAULT_MAX_CHARS;
}

/**
 * Obcina tekst z nagłówkiem podsumowania (zachowuje początek i koniec gdy możliwe).
 */
export function compressForContext(text: string, maxChars?: number): ContextWindowResult {
  const limit = resolveMaxChars(maxChars);
  const originalLength = text.length;
  if (originalLength <= limit) {
    return { text, truncated: false, originalLength, maxChars: limit };
  }

  const headBudget = Math.floor(limit * 0.72);
  const tailBudget = limit - headBudget - 120;
  const head = text.slice(0, headBudget);
  const tail = text.slice(-Math.max(tailBudget, 0));
  const omitted = originalLength - head.length - tail.length;
  const banner = [
    `<!-- gworkspace: truncated ${omitted} chars (${originalLength} → ~${limit}) -->`,
    '',
  ].join('\n');

  const compressed = `${banner}${head}\n\n…[${omitted} znaków pominiętych — użyj węższego zakresu lub mniejszego dokumentu]…\n\n${tail}`;
  return {
    text: compressed.slice(0, limit + 200),
    truncated: true,
    originalLength,
    maxChars: limit,
  };
}
