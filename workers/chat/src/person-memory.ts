/**
 * Pamięć międzysesyjna (MVP): skrót preferencji per zalogowany klient Shopify.
 * Źródło person_id: query `logged_in_customer_id` (App Proxy) — ten sam identyfikator co w URL.
 */
import type { Env } from './config/bindings';
import { getGroqResponse, type GroqMessage } from './ai-client';

export async function loadPersonMemory(db: D1Database, shopifyCustomerId: string): Promise<string | null> {
  const row = await db
    .prepare('SELECT summary FROM person_memory WHERE shopify_customer_id = ?')
    .bind(shopifyCustomerId)
    .first<{ summary: string }>();
  const s = row?.summary?.trim();
  return s && s.length > 0 ? s : null;
}

export async function upsertPersonMemory(db: D1Database, shopifyCustomerId: string, summary: string): Promise<void> {
  const ts = Date.now();
  await db
    .prepare(
      `INSERT INTO person_memory (shopify_customer_id, summary, updated_at)
       VALUES (?, ?, ?)
       ON CONFLICT(shopify_customer_id) DO UPDATE SET
         summary = excluded.summary,
         updated_at = excluded.updated_at`,
    )
    .bind(shopifyCustomerId, summary, ts)
    .run();
}

/** Skraca rozmowę do tekstu dla modelu streszczającego. */
export function historyToPlainText(
  entries: Array<{ role: string; content?: string }>,
  maxChars = 12000,
): string {
  const lowSignalPatterns = [
    /^cześć$/i,
    /^hej$/i,
    /^witaj$/i,
    /^dzień dobry$/i,
    /^pamiętasz mnie[?]?$/i,
    /^poznajesz mnie[?]?$/i,
    /^rozpoznajesz mnie[?]?$/i,
  ];
  const lines = entries
    .filter((e) => e.role === 'user' || e.role === 'assistant')
    .map((e) => `${e.role}: ${(e.content ?? '').slice(0, 4000)}`)
    .filter((line) => {
      const content = line.replace(/^(user|assistant):\s+/i, '').trim();
      if (content.length < 10) return false;
      return !lowSignalPatterns.some((re) => re.test(content));
    });
  const joined = lines.join('\n');
  return joined.length > maxChars ? joined.slice(-maxChars) : joined;
}

function buildFallbackPersonSummary(
  previousSummary: string | null,
  conversationSnippet: string,
): string {
  const userHints = conversationSnippet
    .split('\n')
    .map((line) => line.trim())
    .filter((line) => /^user:\s+/i.test(line))
    .map((line) => line.replace(/^user:\s+/i, '').trim())
    .filter(Boolean)
    .slice(-2);

  const combined = [previousSummary?.trim(), ...userHints]
    .filter((value): value is string => Boolean(value && value.trim()))
    .join(' ')
    .replace(/\s+/g, ' ')
    .trim();

  return combined.slice(0, 700);
}

/**
 * Łączy poprzedni skrót z nową rozmową (jedno wywołanie modelu, krótki output).
 */
export async function mergeSessionIntoPersonSummary(
  env: Env,
  previousSummary: string | null,
  conversationSnippet: string,
): Promise<string> {
  const system: GroqMessage = {
    role: 'system',
    content: `Jesteś asystentem archiwizacji dla sklepu jubilerskiego. Otrzymujesz:
(1) poprzedni skrót pamięci klienta (może być pusty),
(2) fragment najnowszej rozmowy (user/assistant).

Zwróć JEDEN krótki akapit po polsku (maks. 700 znaków) z trwałymi preferencjami: budżet, rozmiar pierścionka, ulubione metale/kamienie, styl — bez cytowania całej rozmowy ani danych technicznych.
Jeśli w nowym fragmencie nie ma nowych trwałych faktów, zwróć skrócony lub niezmieniony poprzedni skrót (nie powielaj go bezsensownie).
Nie wymyślaj faktów. Nie opisuj zamówień ani numerów zamówień — tylko preferencje produktowe i kontekst doradczy.`,
  };
  const user: GroqMessage = {
    role: 'user',
    content: `Poprzedni skrót:\n${previousSummary ?? '(brak)'}\n\nNowa rozmowa (fragment):\n${conversationSnippet}`,
  };
  let out: string | null = null;
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      out = await getGroqResponse([system, user], env, { max_tokens: 512 });
      if (out && out.trim().length > 20) break;
    } catch (e) {
      if (attempt === 1) throw e;
    }
  }
  try {
    const normalized = (out ?? '').trim().slice(0, 2000);
    if (normalized && normalized.length > 0) return normalized;
  } catch (error) {
    // przechwyć poniżej
  }
  // fallback z warunkiem: nie nadpisuj dobrego previousSummary
  console.warn('[person_memory] merge fallback activated:', out);
  if (previousSummary && previousSummary.trim().length > 50) {
    return previousSummary; // zachowaj dobry poprzedni summary
  }
  if (!out || out.trim().length <= 20) throw new Error('Workers AI returned an empty or invalid response');
  return buildFallbackPersonSummary(previousSummary, conversationSnippet);
}
