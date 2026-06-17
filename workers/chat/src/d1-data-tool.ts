import type { Env } from './config/bindings';

export interface D1QueryArgs {
  question?: string;
  table?: 'pixel_events' | 'messages' | 'both';
  limit?: number;
}

interface PixelEventRow {
  session_id: string | null;
  event_type: string | null;
  page_url: string | null;
  created_at: number | null;
  product_id: string | null;
  product_title: string | null;
}

interface MessageRow {
  session_id: string | null;
  role: string | null;
  content: string | null;
  timestamp: number | null;
  storefront_id: string | null;
  channel: string | null;
}

const DEFAULT_LIMIT = 20;
const MAX_LIMIT = 100;

function clampLimit(limit?: number): number {
  if (!limit || limit < 1) return DEFAULT_LIMIT;
  return Math.min(limit, MAX_LIMIT);
}

function interpretQuestion(question: string | undefined): { table: 'pixel_events' | 'messages' | 'both'; intent: string } {
  if (!question) {
    return { table: 'both', intent: 'summary' };
  }

  const q = question.toLowerCase();

  if (q.includes('pixel') || q.includes('event') || q.includes('product') || q.includes('view') || q.includes('page') || q.includes('cart') || q.includes('purchase')) {
    if (q.includes('message') || q.includes('chat') || q.includes('rozmow') || q.includes('gemma')) {
      return { table: 'both', intent: 'cross_reference' };
    }
    return { table: 'pixel_events', intent: q };
  }

  if (q.includes('message') || q.includes('chat') || q.includes('rozmow') || q.includes('gemma') || q.includes('klient') || q.includes('pytanie') || q.includes('odpowiedź') || q.includes('konwersacja')) {
    if (q.includes('pixel') || q.includes('event') || q.includes('product') || q.includes('view')) {
      return { table: 'both', intent: 'cross_reference' };
    }
    return { table: 'messages', intent: q };
  }

  if (q.includes('who') || q.includes('kto') || q.includes('talking') || q.includes('mówi') || q.includes('pisze')) {
    return { table: 'messages', intent: q };
  }

  if (q.includes('recent') || q.includes('ostatni') || q.includes('najnowszy')) {
    return { table: 'both', intent: 'recent' };
  }

  return { table: 'both', intent: 'summary' };
}

async function queryPixelEvents(db: D1Database, intent: string, limit: number): Promise<{ data: PixelEventRow[]; sql: string }> {
  const clampedLimit = clampLimit(limit);

  if (intent.includes('product') || intent.includes('view') || intent.includes('viewing')) {
    const sql = `
      SELECT session_id, event_type, page_url, created_at, product_id, product_title
      FROM pixel_events
      WHERE event_type IN ('view', 'view_product')
        AND product_id IS NOT NULL
      ORDER BY created_at DESC
      LIMIT ?
    `;
    const { results } = await db.prepare(sql).bind(clampedLimit).all<PixelEventRow>();
    return { data: results || [], sql };
  }

  if (intent.includes('cart') || intent.includes('koszyk')) {
    const sql = `
      SELECT session_id, event_type, page_url, created_at, product_id, product_title
      FROM pixel_events
      WHERE event_type IN ('add_to_cart', 'remove_from_cart', 'view_cart')
      ORDER BY created_at DESC
      LIMIT ?
    `;
    const { results } = await db.prepare(sql).bind(clampedLimit).all<PixelEventRow>();
    return { data: results || [], sql };
  }

  if (intent.includes('purchase') || intent.includes('zakup') || intent.includes('checkout')) {
    const sql = `
      SELECT session_id, event_type, page_url, created_at, product_id, product_title
      FROM pixel_events
      WHERE event_type IN ('purchase', 'checkout', 'begin_checkout')
      ORDER BY created_at DESC
      LIMIT ?
    `;
    const { results } = await db.prepare(sql).bind(clampedLimit).all<PixelEventRow>();
    return { data: results || [], sql };
  }

  const sql = `
    SELECT session_id, event_type, page_url, created_at, product_id, product_title
    FROM pixel_events
    ORDER BY created_at DESC
    LIMIT ?
  `;
  const { results } = await db.prepare(sql).bind(clampedLimit).all<PixelEventRow>();
  return { data: results || [], sql };
}

async function queryMessages(db: D1Database, intent: string, limit: number): Promise<{ data: MessageRow[]; sql: string }> {
  const clampedLimit = clampLimit(limit);

  if (intent.includes('who') || intent.includes('kto') || intent.includes('talking') || intent.includes('mówi') || intent.includes('pisze') || intent.includes('gemma')) {
    const sql = `
      SELECT session_id, role, content, timestamp, storefront_id, channel
      FROM messages
      WHERE role = 'user'
      ORDER BY timestamp DESC
      LIMIT ?
    `;
    const { results } = await db.prepare(sql).bind(clampedLimit).all<MessageRow>();
    return { data: results || [], sql };
  }

  if (intent.includes('recent') || intent.includes('ostatni') || intent.includes('najnowszy') || intent.includes('conversation') || intent.includes('konwersacja')) {
    const sql = `
      SELECT session_id, role, content, timestamp, storefront_id, channel
      FROM messages
      ORDER BY timestamp DESC
      LIMIT ?
    `;
    const { results } = await db.prepare(sql).bind(clampedLimit).all<MessageRow>();
    return { data: results || [], sql };
  }

  const sql = `
    SELECT session_id, role, content, timestamp, storefront_id, channel
    FROM messages
    ORDER BY timestamp DESC
    LIMIT ?
  `;
  const { results } = await db.prepare(sql).bind(clampedLimit).all<MessageRow>();
  return { data: results || [], sql };
}

async function crossReferenceQuery(db: D1Database, dbChatbot: D1Database, intent: string, limit: number): Promise<{ data: Record<string, unknown>[]; sql: string }> {
  const clampedLimit = clampLimit(limit);

  const messagesSql = `
    SELECT session_id, role, content, timestamp
    FROM messages
    WHERE role = 'user'
    ORDER BY timestamp DESC
    LIMIT ?
  `;
  const { results: messageResults } = await dbChatbot.prepare(messagesSql).bind(clampedLimit).all<MessageRow>();

  const sessionIds = (messageResults || []).map(r => r.session_id).filter(Boolean);

  if (sessionIds.length === 0) {
    return { data: [], sql: messagesSql };
  }

  const placeholders = sessionIds.map(() => '?').join(',');
  const pixelSql = `
    SELECT session_id, event_type, page_url, created_at, product_id, product_title
    FROM pixel_events
    WHERE session_id IN (${placeholders})
    ORDER BY created_at DESC
    LIMIT ?
  `;
  const { results: pixelResults } = await db.prepare(pixelSql).bind(...sessionIds, clampedLimit).all<PixelEventRow>();

  const combined: Record<string, unknown>[] = [];
  for (const msg of (messageResults || [])) {
    combined.push({
      source: 'messages',
      session_id: msg.session_id,
      role: msg.role,
      content: msg.content,
      timestamp: msg.timestamp,
    });
  }
  for (const pixel of (pixelResults || [])) {
    combined.push({
      source: 'pixel_events',
      session_id: pixel.session_id,
      event_type: pixel.event_type,
      page_url: pixel.page_url,
      created_at: pixel.created_at,
      product_id: pixel.product_id,
      product_title: pixel.product_title,
    });
  }

  return {
    data: combined.slice(0, clampedLimit),
    sql: `${messagesSql}; ${pixelSql}`,
  };
}

export async function executeD1DataQuery(
  env: Env,
  args: D1QueryArgs,
): Promise<{ ok: true; result: { data: Record<string, unknown>[]; sql: string; rowCount: number }; source: string } | { ok: false; error: string }> {
  const { question, table, limit } = args;
  const clampedLimit = clampLimit(limit);

  const interpretation = interpretQuestion(question);
  const resolvedTable = table || interpretation.table;

  try {
    if (resolvedTable === 'pixel_events' || (resolvedTable === 'both' && interpretation.intent === 'pixel_events')) {
      if (!env.DB) {
        return { ok: false, error: 'D1 database binding DB is not available' };
      }
      const result = await queryPixelEvents(env.DB, interpretation.intent, clampedLimit);
      return {
        ok: true,
        result: { data: result.data as unknown as Record<string, unknown>[], sql: result.sql, rowCount: result.data.length },
        source: 'd1_pixel_events',
      };
    }

    if (resolvedTable === 'messages' || (resolvedTable === 'both' && interpretation.intent === 'messages')) {
      if (!env.DB_CHATBOT) {
        return { ok: false, error: 'D1 database binding DB_CHATBOT is not available' };
      }
      const result = await queryMessages(env.DB_CHATBOT, interpretation.intent, clampedLimit);
      return {
        ok: true,
        result: { data: result.data as unknown as Record<string, unknown>[], sql: result.sql, rowCount: result.data.length },
        source: 'd1_messages',
      };
    }

    if (resolvedTable === 'both') {
      if (!env.DB || !env.DB_CHATBOT) {
        return { ok: false, error: 'D1 database bindings (DB, DB_CHATBOT) are not available' };
      }
      if (interpretation.intent === 'cross_reference') {
        const result = await crossReferenceQuery(env.DB, env.DB_CHATBOT, interpretation.intent, clampedLimit);
        return {
          ok: true,
          result: { data: result.data, sql: result.sql, rowCount: result.data.length },
          source: 'd1_cross_reference',
        };
      }

      const pixelResult = await queryPixelEvents(env.DB, interpretation.intent, Math.floor(clampedLimit / 2));
      const messageResult = await queryMessages(env.DB_CHATBOT, interpretation.intent, Math.floor(clampedLimit / 2));

      const combined = [
        ...pixelResult.data.map(r => ({ ...r, source: 'pixel_events' })),
        ...messageResult.data.map(r => ({ ...r, source: 'messages' })),
      ];

      return {
        ok: true,
        result: { data: combined as unknown as Record<string, unknown>[], sql: `${pixelResult.sql}; ${messageResult.sql}`, rowCount: combined.length },
        source: 'd1_combined',
      };
    }

    return { ok: false, error: `Unknown table: ${resolvedTable}` };
  } catch (err: any) {
    console.error('[d1_data_tool] Query failed:', err);
    return { ok: false, error: err.message || String(err) };
  }
}

export function formatD1ResultForPrompt(result: { data: Record<string, unknown>[]; sql: string; rowCount: number }, source: string): string {
  if (result.data.length === 0) {
    return `No results found. SQL executed: ${result.sql}`;
  }

  const headers = Object.keys(result.data[0] || {});
  const headerLine = headers.join('\t');
  const rows = result.data.slice(0, 15).map(row =>
    headers.map(h => String(row[h] ?? '')).join('\t')
  ).join('\n');

  const totalNote = result.rowCount > 15 ? `\n... and ${result.rowCount - 15} more rows (total: ${result.rowCount})` : '';

  return `Source: ${source}\n\n${headerLine}\n${rows}${totalNote}\n\nSQL: ${result.sql}`;
}
