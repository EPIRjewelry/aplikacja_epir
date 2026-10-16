import {beforeAll, describe, expect, it} from 'vitest';
import {env} from 'cloudflare:test';
import {gemmaCustomerMessagesSql} from '../../../bigquery-batch/src/gemma-channel-filter';

/** Oczekiwane ID wierszy przechodzące gemmaCustomerMessagesSql (tylko GE + GZ). */
const EXPECTED_PASSING_IDS = [1, 2] as const;

const ROW = {
  ge: 1,
  gz: 2,
  operatorMsg: 3,
  internalDashboardMsg: 4,
  operatorSpacedChannel: 5,
  operatorStorefront: 6,
  buyerMsgOperatorSession: 7,
  buyerMsgInternalDashboardSession: 8,
  buyerMsgOperatorStorefrontSession: 9,
} as const;

async function setupSchema() {
  // sessions — migrations/001_create_analytics_schema.sql:6-16
  //            migrations/006_idempotent_persistence.sql:4-5 (channel, storefront_id)
  await env.DB_CHATBOT.prepare(
    `CREATE TABLE IF NOT EXISTS sessions (
      session_id TEXT PRIMARY KEY,
      customer_id TEXT,
      first_name TEXT,
      last_name TEXT,
      cart_id TEXT,
      created_at INTEGER NOT NULL,
      last_activity INTEGER NOT NULL,
      archived_at INTEGER NOT NULL,
      message_count INTEGER DEFAULT 0,
      channel TEXT,
      storefront_id TEXT
    )`,
  ).run();

  // messages — migrations/001_create_analytics_schema.sql:24-34
  //            migrations/003_storefront_messages.sql:5-6
  //            migrations/006_idempotent_persistence.sql:10
  await env.DB_CHATBOT.prepare(
    `CREATE TABLE IF NOT EXISTS messages (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      session_id TEXT NOT NULL,
      role TEXT NOT NULL,
      content TEXT NOT NULL,
      timestamp INTEGER NOT NULL,
      tool_calls TEXT,
      tool_call_id TEXT,
      name TEXT,
      storefront_id TEXT,
      channel TEXT,
      message_uid TEXT
    )`,
  ).run();
}

async function seedSessions() {
  const now = 1_700_000_000;
  const rows = [
    {
      session_id: 'sess_sql-ge-fikcyjny',
      channel: 'online-store',
      storefront_id: 'online-store',
    },
    {
      session_id: 'sess_sql-gz-fikcyjny',
      channel: 'hydrogen-zareczyny',
      storefront_id: 'zareczyny',
    },
    {
      session_id: 'sess_sql-op-session-fikcyjny',
      channel: 'operator',
      storefront_id: 'operator',
    },
    {
      session_id: 'sess_sql-idash-session-fikcyjny',
      channel: 'internal-dashboard',
      storefront_id: 'online-store',
    },
    {
      session_id: 'sess_sql-op-sf-session-fikcyjny',
      channel: 'online-store',
      storefront_id: 'operator',
    },
  ];

  for (const row of rows) {
    await env.DB_CHATBOT.prepare(
      `INSERT INTO sessions (
        session_id, created_at, last_activity, archived_at, channel, storefront_id
      ) VALUES (?, ?, ?, ?, ?, ?)`,
    )
      .bind(row.session_id, now, now, now, row.channel, row.storefront_id)
      .run();
  }
}

async function seedMessages() {
  const ts = 1_700_000_000;
  const inserts = [
    {
      id: ROW.ge,
      session_id: 'sess_sql-ge-fikcyjny',
      channel: 'online-store',
      storefront_id: 'online-store',
    },
    {
      id: ROW.gz,
      session_id: 'sess_sql-gz-fikcyjny',
      channel: 'hydrogen-zareczyny',
      storefront_id: 'zareczyny',
    },
    {
      id: ROW.operatorMsg,
      session_id: 'sess_sql-op-fikcyjny',
      channel: 'operator',
      storefront_id: 'operator',
    },
    {
      id: ROW.internalDashboardMsg,
      session_id: 'sess_sql-idash-fikcyjny',
      channel: 'internal-dashboard',
      storefront_id: 'online-store',
    },
    {
      id: ROW.operatorSpacedChannel,
      session_id: 'sess_sql-op-space-fikcyjny',
      channel: ' Operator ',
      storefront_id: 'online-store',
    },
    {
      id: ROW.operatorStorefront,
      session_id: 'sess_sql-op-sf-fikcyjny',
      channel: 'online-store',
      storefront_id: 'operator',
    },
    {
      id: ROW.buyerMsgOperatorSession,
      session_id: 'sess_sql-op-session-fikcyjny',
      channel: 'online-store',
      storefront_id: 'online-store',
    },
    {
      id: ROW.buyerMsgInternalDashboardSession,
      session_id: 'sess_sql-idash-session-fikcyjny',
      channel: 'online-store',
      storefront_id: 'online-store',
    },
    {
      id: ROW.buyerMsgOperatorStorefrontSession,
      session_id: 'sess_sql-op-sf-session-fikcyjny',
      channel: 'online-store',
      storefront_id: 'online-store',
    },
  ];

  for (const row of inserts) {
    await env.DB_CHATBOT.prepare(
      `INSERT INTO messages (id, session_id, role, content, timestamp, storefront_id, channel, message_uid)
       VALUES (?, ?, 'user', 'fikcyjna treść', ?, ?, ?, ?)`,
    )
      .bind(
        row.id,
        row.session_id,
        ts,
        row.storefront_id,
        row.channel,
        `uid-${row.id}`,
      )
      .run();
  }
}

describe('E0 boundary — gemmaCustomerMessagesSql on real D1 (Miniflare)', () => {
  beforeAll(async () => {
    await setupSchema();
    await seedSessions();
    await seedMessages();
  });

  it('SELECT with gemmaCustomerMessagesSql keeps only GE and GZ buyer rows', async () => {
    const predicate = gemmaCustomerMessagesSql('m');
    const result = await env.DB_CHATBOT.prepare(
      `SELECT id FROM messages m WHERE ${predicate} ORDER BY id ASC`,
    ).all<{id: number}>();

    const ids = (result.results ?? []).map((r) => r.id);
    expect(ids).toEqual([...EXPECTED_PASSING_IDS]);
  });
});
