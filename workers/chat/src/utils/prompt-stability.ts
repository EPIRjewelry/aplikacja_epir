/**
 * worker/src/utils/prompt-stability.ts
 *
 * Diagnostyka prefix cache Workers AI (`x-session-affinity`).
 *
 * Cel: odpowiedzieć pytaniem/logiem na "czy każda tura w tej samej sesji zaczyna
 * się identycznym prefixem?". Jeśli hash prefixu zmienia się między turami —
 * `cached_tokens` będzie niskie, bo cache jest unieważniany.
 *
 * Rozmiar prefix cache w Workers AI to ~2–4k tokenów; hash liczymy z pierwszych
 * `PROMPT_PREFIX_HASH_BYTES` bajtów serialized messages+tools (rząd wielkości
 * dobrany tak, żeby zmieściły się system prompt + definicje narzędzi, ale nie
 * wiadomości użytkownika).
 */

/**
 * Limit bajtów brany pod uwagę przy liczeniu hashu prefixu. 8 KB ≈ 2k tokenów,
 * wystarczająco żeby objąć `system` + `tools` + pierwsze 1–2 wiadomości, a
 * odciąć zmienny ogon rozmowy.
 */
export const PROMPT_PREFIX_HASH_BYTES = 8 * 1024;

type PrefixMessage = {
  role: string;
  content: unknown;
  tool_calls?: unknown;
  tool_call_id?: string;
  name?: string;
};

type PrefixTool = {
  type?: string;
  function?: { name?: string; description?: string; parameters?: unknown };
};

function bytesToHex(buffer: ArrayBuffer): string {
  const view = new Uint8Array(buffer);
  let hex = '';
  for (let i = 0; i < view.length; i++) {
    hex += view[i].toString(16).padStart(2, '0');
  }
  return hex;
}

/**
 * Serializuje messages+tools do stringa w deterministycznej kolejności i bierze
 * pierwsze `PROMPT_PREFIX_HASH_BYTES` bajtów. Dwie identyczne "głowy" dają
 * identyczny hash — idealnie pod prefix cache.
 *
 * Zwracamy zawsze świeży `Uint8Array` na `ArrayBuffer` (nie `SharedArrayBuffer`),
 * żeby pasować do sygnatury `crypto.subtle.digest(BufferSource)`.
 */
export function serializePromptPrefix(
  messages: PrefixMessage[],
  tools: PrefixTool[] | undefined,
  limitBytes: number = PROMPT_PREFIX_HASH_BYTES,
): Uint8Array {
  const payload = {
    tools: Array.isArray(tools) ? tools : [],
    messages,
  };
  const json = JSON.stringify(payload);
  const encoded = new TextEncoder().encode(json);
  const len = Math.min(encoded.length, limitBytes);
  const out = new Uint8Array(new ArrayBuffer(len));
  out.set(encoded.subarray(0, len));
  return out;
}

/**
 * SHA-256 (hex, skrócone do 16 znaków) z pierwszych ~2k tokenów promptu.
 * 16 znaków daje 64 bity wariancji — wystarczająco do korelacji w logach,
 * a czytelnie krótki w `wrangler tail`.
 */
export async function hashPromptPrefix(
  messages: PrefixMessage[],
  tools?: PrefixTool[],
  limitBytes: number = PROMPT_PREFIX_HASH_BYTES,
): Promise<string> {
  const data = serializePromptPrefix(messages, tools, limitBytes);
  const digest = await crypto.subtle.digest('SHA-256', data.buffer as ArrayBuffer);
  return bytesToHex(digest).slice(0, 16);
}

export const __test = { serializePromptPrefix };
