// Standalone util (no import from `ai-client`) — unikamy cyklu modułów:
// `ai-client` importuje ten plik, a sanitizer musi znać kształt wiadomości.

// Markery kanałów Harmony, które nie mogą trafić ponownie do API jako historia.
// Spec: only the FINAL response goes back; analysis / commentary preambles are forbidden.
const HARMONY_CONTROL_TOKEN_RE = /<\|(?:channel|message|start|end|return|call|constrain)\|>/gi;
const HARMONY_ANALYSIS_BLOCK_RE = /<\|channel\|>\s*analysis[\s\S]*?(?=<\|channel\|>\s*final|<\|end\|>|$)/gi;
const HARMONY_COMMENTARY_BLOCK_RE = /<\|channel\|>\s*commentary[\s\S]*?(?=<\|channel\|>\s*final|<\|end\|>|$)/gi;
const HARMONY_STRAY_LITERALS_RE = /\b(?:assistantanalysis|assistantcommentary|assistantfinal|analysisfinal|commentaryfinal)\b/gi;

function stripHarmonyContentMarkers(text: string): string {
  if (!text) return text;
  return text
    .replace(HARMONY_ANALYSIS_BLOCK_RE, '')
    .replace(HARMONY_COMMENTARY_BLOCK_RE, '')
    .replace(HARMONY_CONTROL_TOKEN_RE, '')
    .replace(HARMONY_STRAY_LITERALS_RE, '')
    .trimStart();
}

type HarmonyHistoryMessage = {
  role: 'system' | 'user' | 'assistant' | 'tool';
  content: unknown;
  tool_calls?: unknown;
  tool_call_id?: string;
  name?: string;
};

type TextPart = { type: 'text'; text: string };

/**
 * Sanitizes the assistant history before sending to Groq/Harmony API.
 * Per Harmony spec, prior assistant turns must contain ONLY the final response —
 * never the analysis (reasoning) channel nor commentary preambles.
 *
 * - role='assistant': removes any leaked `reasoning` / `reasoning_content` / `analysis`
 *   object fields and strips Harmony control tokens from `content`. Preserves `tool_calls`.
 * - role='tool': returned untouched (MCP results must reach the model verbatim).
 * - role='user'/'system': untouched.
 */
export function sanitizeHarmonyHistory<T extends HarmonyHistoryMessage>(messages: T[]): T[] {
  return messages.map((m) => {
    if (m.role === 'tool' || m.role === 'user' || m.role === 'system') {
      return m;
    }
    const out = { ...m } as T & Record<string, unknown>;
    delete out.reasoning;
    delete out.reasoning_content;
    delete out.analysis;
    const c = out.content;
    if (typeof c === 'string') {
      out.content = stripHarmonyContentMarkers(c) as T['content'];
    } else if (Array.isArray(c)) {
      out.content = c.map((part) => {
        if (part && typeof part === 'object' && (part as TextPart).type === 'text' && typeof (part as TextPart).text === 'string') {
          return { ...(part as object), type: 'text', text: stripHarmonyContentMarkers((part as TextPart).text) };
        }
        return part;
      }) as T['content'];
    }
    return out;
  });
}
