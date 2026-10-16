import {beforeAll, describe, expect, it} from 'vitest';
import {env} from 'cloudflare:test';
import {gemmaCustomerMessagesSql} from '../../../bigquery-batch/src/gemma-channel-filter';

const ROW = {
  ge: 1,
  gz: 2,
  operator: 3,
  internalDashboard: 4,
  operatorSpaced: 5,
} as const;

async function setupSchema() {
  await env.DB_CHATBOT.prepare(
    `CREATE TABLE IF NOT EXISTS sessions (
      session_id TEXT PRIMARY KEY,
      channel TEXT,
      storefront_id TEXT
    )`,
  ).run();

  await env.DB_CHATBOT.prepare(
    `CREATE TABLE IF NOT EXISTS messages (
      id INTEGER PRIMARY KEY,
      session_id TEXT NOT NULL,
      role TEXT NOT NULL,
      content TEXT NOT NULL,
      timestamp INTEGER NOT NULL,
      storefront_id TEXT,
      channel TEXT,
      message_uid TEXT
    )`,
  ).run();
}

async function seedRows() {
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
      id: ROW.operator,
      session_id: 'sess_sql-op-fikcyjny',
      channel: 'operator',
      storefront_id: 'operator',
    },
    {
      id: ROW.internalDashboard,
      session_id: 'sess_sql-idash-fikcyjny',
      channel: 'internal-dashboard',
      storefront_id: 'online-store',
    },
    {
      id: ROW.operatorSpaced,
      session_id: 'sess_sql-op-space-fikcyjny',
      channel: ' Operator ',
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
    await seedRows();
  });

  it('SELECT with gemmaCustomerMessagesSql keeps only GE and GZ buyer rows', async () => {
    const predicate = gemmaCustomerMessagesSql('m');
    const result = await env.DB_CHATBOT.prepare(
      `SELECT id FROM messages m WHERE ${predicate} ORDER BY id ASC`,
    ).all<{id: number}>();

    const ids = (result.results ?? []).map((r) => r.id);
    expect(ids).toEqual([ROW.ge, ROW.gz]);
  });
});
