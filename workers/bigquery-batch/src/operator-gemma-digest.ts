/**
 * Skrót rozmów kupujących z Gemmą (kanał ≠ operator) z ostatnich 24 h.
 */

export type GemmaDigestRow = {
  session_id: string;
  customer_id: string | null;
  first_name: string | null;
  last_name: string | null;
  storefront_id: string | null;
  user_excerpt: string;
  assistant_excerpt: string | null;
  last_ts: number;
};

export type GemmaDigestEnv = {
  DB_CHATBOT: D1Database;
};

function displayWho(row: {
  customer_id: string | null;
  first_name: string | null;
  last_name: string | null;
  session_id: string;
}): string {
  const name = [row.first_name, row.last_name].filter(Boolean).join(' ').trim();
  if (name) return name;
  if (row.customer_id?.trim()) return `klient ${row.customer_id.trim().slice(0, 24)}`;
  return `sesja ${row.session_id.slice(0, 12)}…`;
}

function excerpt(text: string | null | undefined, max = 220): string {
  const t = (text ?? '').replace(/\s+/g, ' ').trim();
  if (!t) return '—';
  return t.length > max ? `${t.slice(0, max)}…` : t;
}

export async function fetchGemmaConversations24h(
  env: GemmaDigestEnv,
  sinceMs: number,
  limit = 20,
): Promise<GemmaDigestRow[]> {
  const cap = Math.min(Math.max(limit, 1), 40);
  try {
    const sessions = await env.DB_CHATBOT.prepare(
      `SELECT session_id
       FROM messages
       WHERE timestamp >= ?1
         AND role = 'user'
         AND (channel IS NULL OR channel != 'operator')
       GROUP BY session_id
       ORDER BY MAX(timestamp) DESC
       LIMIT ?2`,
    )
      .bind(sinceMs, cap * 2)
      .all<{ session_id: string }>();

    const ids = (sessions.results ?? []).map((r) => r.session_id).filter(Boolean);
    if (ids.length === 0) return [];

    const rows: GemmaDigestRow[] = [];
    for (const sessionId of ids.slice(0, cap)) {
      const meta = await env.DB_CHATBOT.prepare(
        `SELECT customer_id, first_name, last_name, storefront_id
         FROM sessions WHERE session_id = ?1 LIMIT 1`,
      )
        .bind(sessionId)
        .first<{
          customer_id: string | null;
          first_name: string | null;
          last_name: string | null;
          storefront_id: string | null;
        }>();

      const userMsg = await env.DB_CHATBOT.prepare(
        `SELECT content, timestamp FROM messages
         WHERE session_id = ?1 AND role = 'user' AND timestamp >= ?2
           AND (channel IS NULL OR channel != 'operator')
         ORDER BY timestamp ASC LIMIT 1`,
      )
        .bind(sessionId, sinceMs)
        .first<{ content: string; timestamp: number }>();

      if (!userMsg) continue;

      const assistantMsg = await env.DB_CHATBOT.prepare(
        `SELECT content FROM messages
         WHERE session_id = ?1 AND role = 'assistant' AND timestamp >= ?2
           AND (channel IS NULL OR channel != 'operator')
         ORDER BY timestamp ASC LIMIT 1`,
      )
        .bind(sessionId, sinceMs)
        .first<{ content: string }>();

      rows.push({
        session_id: sessionId,
        customer_id: meta?.customer_id ?? null,
        first_name: meta?.first_name ?? null,
        last_name: meta?.last_name ?? null,
        storefront_id: meta?.storefront_id ?? null,
        user_excerpt: excerpt(userMsg.content),
        assistant_excerpt: assistantMsg ? excerpt(assistantMsg.content, 160) : null,
        last_ts: userMsg.timestamp,
      });
    }

    rows.sort((a, b) => b.last_ts - a.last_ts);
    return rows.slice(0, cap);
  } catch (e) {
    console.warn('[gemma-digest] query failed:', e);
    return [];
  }
}

export function buildGemmaDigestMarkdown(rows: GemmaDigestRow[], reportDate: string): string {
  const lines: string[] = [
    `## Gemma — rozmowy z kupującymi (24 h do ${reportDate})`,
    '',
  ];
  if (!rows.length) {
    lines.push('_Brak nowych wiadomości user (kanał storefront) w ostatnich 24 h._');
    return lines.join('\n');
  }
  lines.push(`_Liczba sesji z aktywnością: **${rows.length}** (kanał ≠ operator)._`, '');
  for (const r of rows) {
    const who = displayWho(r);
    const shop = r.storefront_id ? ` · ${r.storefront_id}` : '';
    lines.push(`### ${who}${shop}`);
    lines.push(`- **Pytał/a:** ${r.user_excerpt}`);
    if (r.assistant_excerpt) {
      lines.push(`- **Gemma:** ${r.assistant_excerpt}`);
    }
    lines.push('');
  }
  return lines.join('\n').trimEnd();
}
