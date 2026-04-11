type SessionContextRow = {
  id: 1;
  cart_id: string | null;
  session_id: string | null;
  storefront_id: string | null;
  channel: string | null;
};

type SessionCustomerRow = {
  customer_id: string;
  first_name: string | null;
  last_name: string | null;
};

type SessionMetaRow = {
  id: 1;
  created_at: number | null;
  message_seq: number;
  tool_call_seq: number;
  usage_seq: number;
  cart_activity_seq: number;
};

type MessageRow = {
  id: number;
  role: string;
  content: string;
  ts: number;
  tool_calls: string | null;
  tool_call_id: string | null;
  name: string | null;
  message_uid: string | null;
};

type ReplayKeyRow = {
  signature: string;
  expires_at: number;
};

type ProductViewRow = {
  id: number;
  product_id: string;
  product_type: string | null;
  product_title: string | null;
  duration: number;
  ts: number;
  session_id: string | null;
};

type ProactiveActivationRow = {
  id: number;
  customer_id: string;
  session_id: string;
  reason: string;
  ts: number;
  activated: number;
};

function clone<T>(value: T): T {
  return value === undefined ? value : JSON.parse(JSON.stringify(value));
}

function normalizeSql(sql: string): string {
  return sql.replace(/\s+/g, ' ').trim().toLowerCase();
}

function toNullableString(value: unknown): string | null {
  if (value === null || value === undefined) return null;
  return typeof value === 'string' ? value : String(value);
}

function toNumber(value: unknown): number {
  return typeof value === 'number' ? value : Number(value);
}

function emptySessionContext(): SessionContextRow {
  return {
    id: 1,
    cart_id: null,
    session_id: null,
    storefront_id: null,
    channel: null,
  };
}

function emptySessionMeta(): SessionMetaRow {
  return {
    id: 1,
    created_at: null,
    message_seq: 0,
    tool_call_seq: 0,
    usage_seq: 0,
    cart_activity_seq: 0,
  };
}

class FakeSqlCursor<T extends Record<string, unknown>> {
  constructor(private readonly rows: T[]) {}

  one(): T | null {
    return this.rows.length > 0 ? clone(this.rows[0]) : null;
  }

  toArray(): T[] {
    return this.rows.map((row) => clone(row));
  }
}

class SessionDoSqlStore {
  private sessionContext: SessionContextRow | null = null;
  private sessionMeta: SessionMetaRow | null = null;
  private sessionCustomer: SessionCustomerRow | null = null;
  private messages: MessageRow[] = [];
  private replayKeys: ReplayKeyRow[] = [];
  private productViews: ProductViewRow[] = [];
  private proactiveActivations: ProactiveActivationRow[] = [];
  private nextMessageId = 1;
  private nextProductViewId = 1;
  private nextProactiveActivationId = 1;

  exec(sql: string, ...args: unknown[]): FakeSqlCursor<Record<string, unknown>> {
    const statements = sql
      .split(';')
      .map((statement) => statement.trim())
      .filter(Boolean);

    if (statements.length > 1 && args.length === 0) {
      let lastCursor = new FakeSqlCursor<Record<string, unknown>>([]);
      for (const statement of statements) {
        lastCursor = this.exec(statement);
      }
      return lastCursor;
    }

    const normalized = normalizeSql(sql);
    if (!normalized) {
      return new FakeSqlCursor<Record<string, unknown>>([]);
    }

    if (
      normalized.startsWith('create table if not exists session_context') ||
      normalized.startsWith('create table if not exists session_meta') ||
      normalized.startsWith('create table if not exists session_customer') ||
      normalized.startsWith('create table if not exists messages') ||
      normalized.startsWith('create table if not exists replay_keys') ||
      normalized.startsWith('create table if not exists product_views') ||
      normalized.startsWith('create table if not exists proactive_chat_activations') ||
      normalized.startsWith('create unique index if not exists idx_session_messages_uid') ||
      normalized.startsWith('create index if not exists idx_session_messages_ts') ||
      normalized.startsWith('create index if not exists idx_replay_keys_expires_at') ||
      normalized.startsWith('create index if not exists idx_product_views_ts') ||
      normalized.startsWith('create index if not exists idx_proactive_chat_activations_ts')
    ) {
      return new FakeSqlCursor<Record<string, unknown>>([]);
    }

    if (normalized === 'insert or ignore into session_context (id) values (1)') {
      this.ensureSessionContext();
      return new FakeSqlCursor<Record<string, unknown>>([]);
    }

    if (normalized === 'insert or ignore into session_meta (id, created_at, message_seq, tool_call_seq, usage_seq, cart_activity_seq) values (1, null, 0, 0, 0, 0)') {
      this.ensureSessionMeta();
      return new FakeSqlCursor<Record<string, unknown>>([]);
    }

    if (normalized === 'alter table messages add column message_uid text') {
      return new FakeSqlCursor<Record<string, unknown>>([]);
    }

    if (normalized === 'update session_context set cart_id = ?, session_id = ?, storefront_id = ?, channel = ? where id = 1') {
      const sessionContext = this.ensureSessionContext();
      sessionContext.cart_id = toNullableString(args[0]);
      sessionContext.session_id = toNullableString(args[1]);
      sessionContext.storefront_id = toNullableString(args[2]);
      sessionContext.channel = toNullableString(args[3]);
      return new FakeSqlCursor<Record<string, unknown>>([]);
    }

    if (normalized === 'select cart_id, session_id, storefront_id, channel from session_context where id = 1') {
      const sessionContext = this.ensureSessionContext();
      return new FakeSqlCursor<Record<string, unknown>>([
        {
          cart_id: sessionContext.cart_id,
          session_id: sessionContext.session_id,
          storefront_id: sessionContext.storefront_id,
          channel: sessionContext.channel,
        },
      ]);
    }

    if (normalized === 'select created_at, message_seq, tool_call_seq, usage_seq, cart_activity_seq from session_meta where id = 1') {
      const sessionMeta = this.ensureSessionMeta();
      return new FakeSqlCursor<Record<string, unknown>>([
        {
          created_at: sessionMeta.created_at,
          message_seq: sessionMeta.message_seq,
          tool_call_seq: sessionMeta.tool_call_seq,
          usage_seq: sessionMeta.usage_seq,
          cart_activity_seq: sessionMeta.cart_activity_seq,
        },
      ]);
    }

    if (normalized === 'insert or replace into session_meta (id, created_at, message_seq, tool_call_seq, usage_seq, cart_activity_seq) values (1, ?, ?, ?, ?, ?)') {
      this.sessionMeta = {
        id: 1,
        created_at: args[0] === null || args[0] === undefined ? null : toNumber(args[0]),
        message_seq: toNumber(args[1]),
        tool_call_seq: toNumber(args[2]),
        usage_seq: toNumber(args[3]),
        cart_activity_seq: toNumber(args[4]),
      };
      return new FakeSqlCursor<Record<string, unknown>>([]);
    }

    if (normalized === 'insert or replace into session_customer (id, customer_id, first_name, last_name) values (1, ?, ?, ?)') {
      this.sessionCustomer = {
        customer_id: String(args[0]),
        first_name: toNullableString(args[1]),
        last_name: toNullableString(args[2]),
      };
      return new FakeSqlCursor<Record<string, unknown>>([]);
    }

    if (normalized === 'select customer_id, first_name, last_name from session_customer where id = 1') {
      return new FakeSqlCursor<Record<string, unknown>>(
        this.sessionCustomer ? [this.sessionCustomer] : [],
      );
    }

    if (normalized === 'insert into messages (role, content, ts, tool_calls, tool_call_id, name, message_uid) values (?, ?, ?, ?, ?, ?, ?)') {
      this.messages.push({
        id: this.nextMessageId++,
        role: String(args[0]),
        content: String(args[1] ?? ''),
        ts: toNumber(args[2]),
        tool_calls: toNullableString(args[3]),
        tool_call_id: toNullableString(args[4]),
        name: toNullableString(args[5]),
        message_uid: toNullableString(args[6]),
      });
      return new FakeSqlCursor<Record<string, unknown>>([]);
    }

    if (normalized === 'select id, role, content, ts, tool_calls, tool_call_id, name, message_uid from messages order by ts asc, id asc') {
      return new FakeSqlCursor<Record<string, unknown>>(this.sortedMessages());
    }

    if (normalized === 'update messages set content = ? where id = ?') {
      const targetId = toNumber(args[1]);
      const current = this.messages.find((message) => message.id === targetId);
      if (current) {
        current.content = String(args[0] ?? '');
      }
      return new FakeSqlCursor<Record<string, unknown>>([]);
    }

    if (normalized === 'delete from messages where id = ?') {
      const targetId = toNumber(args[0]);
      this.messages = this.messages.filter((message) => message.id !== targetId);
      return new FakeSqlCursor<Record<string, unknown>>([]);
    }

    if (normalized === 'delete from replay_keys where expires_at < ?') {
      const cutoff = toNumber(args[0]);
      this.replayKeys = this.replayKeys.filter((row) => row.expires_at >= cutoff);
      return new FakeSqlCursor<Record<string, unknown>>([]);
    }

    if (normalized === 'insert into replay_keys (signature, expires_at) values (?, ?)') {
      const signature = String(args[0]);
      if (this.replayKeys.some((row) => row.signature === signature)) {
        throw new Error('UNIQUE constraint failed: replay_keys.signature');
      }
      this.replayKeys.push({ signature, expires_at: toNumber(args[1]) });
      return new FakeSqlCursor<Record<string, unknown>>([]);
    }

    if (normalized === 'insert into product_views (product_id, product_type, product_title, duration, ts, session_id) values (?, ?, ?, ?, ?, ?)') {
      this.productViews.push({
        id: this.nextProductViewId++,
        product_id: String(args[0]),
        product_type: toNullableString(args[1]),
        product_title: toNullableString(args[2]),
        duration: toNumber(args[3]),
        ts: toNumber(args[4]),
        session_id: toNullableString(args[5]),
      });
      return new FakeSqlCursor<Record<string, unknown>>([]);
    }

    if (normalized === 'select id from product_views order by ts asc, id asc') {
      return new FakeSqlCursor<Record<string, unknown>>(
        this.productViews
          .slice()
          .sort((a, b) => (a.ts - b.ts) || (a.id - b.id))
          .map((row) => ({ id: row.id })),
      );
    }

    if (normalized === 'delete from product_views where id = ?') {
      const targetId = toNumber(args[0]);
      this.productViews = this.productViews.filter((row) => row.id !== targetId);
      return new FakeSqlCursor<Record<string, unknown>>([]);
    }

    if (normalized === 'insert into proactive_chat_activations (customer_id, session_id, reason, ts, activated) values (?, ?, ?, ?, ?)') {
      this.proactiveActivations.push({
        id: this.nextProactiveActivationId++,
        customer_id: String(args[0]),
        session_id: String(args[1]),
        reason: String(args[2]),
        ts: toNumber(args[3]),
        activated: toNumber(args[4]),
      });
      return new FakeSqlCursor<Record<string, unknown>>([]);
    }

    if (normalized === 'select id from proactive_chat_activations order by ts asc, id asc') {
      return new FakeSqlCursor<Record<string, unknown>>(
        this.proactiveActivations
          .slice()
          .sort((a, b) => (a.ts - b.ts) || (a.id - b.id))
          .map((row) => ({ id: row.id })),
      );
    }

    if (normalized === 'delete from proactive_chat_activations where id = ?') {
      const targetId = toNumber(args[0]);
      this.proactiveActivations = this.proactiveActivations.filter((row) => row.id !== targetId);
      return new FakeSqlCursor<Record<string, unknown>>([]);
    }

    throw new Error(`Unsupported SQL in SessionDO test stub: ${sql}`);
  }

  inspect = {
    getSessionContext: (): SessionContextRow => clone(this.ensureSessionContext()),
    getSessionMeta: (): SessionMetaRow => clone(this.ensureSessionMeta()),
    getCustomer: (): SessionCustomerRow | null => (this.sessionCustomer ? clone(this.sessionCustomer) : null),
    getHistory: (): Array<Record<string, unknown>> => this.historySnapshot(),
    getReplayKeys: (): ReplayKeyRow[] => clone(this.replayKeys),
    getProductViews: (): Array<Record<string, unknown>> => this.productViewsSnapshot(),
    getProactiveActivations: (): Array<Record<string, unknown>> => this.proactiveActivationsSnapshot(),
  };

  legacyGet(key: string): unknown {
    const sessionContext = this.ensureSessionContext();

    switch (key) {
      case 'history':
        return this.historySnapshot();
      case 'cart_id':
        return sessionContext.cart_id ?? undefined;
      case 'session_id':
        return sessionContext.session_id ?? undefined;
      case 'storefront_id':
        return sessionContext.storefront_id ?? undefined;
      case 'channel':
        return sessionContext.channel ?? undefined;
      case 'customer':
        return this.sessionCustomer ? clone(this.sessionCustomer) : undefined;
      case 'last_product_view': {
        const last = this.productViewsSnapshot().at(-1);
        return last ?? undefined;
      }
      case 'product_views':
        return this.productViewsSnapshot();
      case 'proactive_chat_active':
        return this.proactiveActivations.length > 0 ? true : undefined;
      case 'proactive_chat_event': {
        const last = this.proactiveActivationsSnapshot().at(-1);
        return last ?? undefined;
      }
      case 'proactive_activations':
        return this.proactiveActivationsSnapshot();
      default:
        if (key.startsWith('replay:')) {
          const signature = key.slice('replay:'.length);
          return this.replayKeys.some((row) => row.signature === signature) ? true : undefined;
        }
        return undefined;
    }
  }

  private ensureSessionContext(): SessionContextRow {
    if (!this.sessionContext) {
      this.sessionContext = emptySessionContext();
    }
    return this.sessionContext;
  }

  private ensureSessionMeta(): SessionMetaRow {
    if (!this.sessionMeta) {
      this.sessionMeta = emptySessionMeta();
    }
    return this.sessionMeta;
  }

  private sortedMessages(): MessageRow[] {
    return this.messages.slice().sort((a, b) => (a.ts - b.ts) || (a.id - b.id));
  }

  private historySnapshot(): Array<Record<string, unknown>> {
    return this.sortedMessages().map((row) => {
      let toolCalls: unknown;
      if (typeof row.tool_calls === 'string' && row.tool_calls.trim().length > 0) {
        toolCalls = JSON.parse(row.tool_calls);
      }

      return clone({
        role: row.role,
        content: row.content,
        ts: row.ts,
        ...(toolCalls !== undefined ? { tool_calls: toolCalls } : {}),
        ...(row.tool_call_id ? { tool_call_id: row.tool_call_id } : {}),
        ...(row.name ? { name: row.name } : {}),
      });
    });
  }

  private productViewsSnapshot(): Array<Record<string, unknown>> {
    return this.productViews
      .slice()
      .sort((a, b) => (a.ts - b.ts) || (a.id - b.id))
      .map((row) => clone({
        product_id: row.product_id,
        product_type: row.product_type,
        product_title: row.product_title,
        duration: row.duration,
        timestamp: row.ts,
        session_id: row.session_id,
      }));
  }

  private proactiveActivationsSnapshot(): Array<Record<string, unknown>> {
    return this.proactiveActivations
      .slice()
      .sort((a, b) => (a.ts - b.ts) || (a.id - b.id))
      .map((row) => clone({
        customer_id: row.customer_id,
        session_id: row.session_id,
        reason: row.reason,
        timestamp: row.ts,
        activated: row.activated === 1,
      }));
  }
}

export function makeDurableStateStub(storageId = 'stub-session-id') {
  const sqlStore = new SessionDoSqlStore();
  const snapshotStorage = {
    get(key: string) {
      return sqlStore.legacyGet(key);
    },
    has(key: string) {
      return sqlStore.legacyGet(key) !== undefined;
    },
  };

  const state = {
    id: {
      toString() {
        return storageId;
      },
    },
    storage: {
      sql: {
        exec: sqlStore.exec.bind(sqlStore),
      },
      async get() {
        throw new Error('Legacy storage.get should not be used by SQL-backed SessionDO tests');
      },
      async put() {
        throw new Error('Legacy storage.put should not be used by SQL-backed SessionDO tests');
      },
    },
    async blockConcurrencyWhile(cb: () => Promise<void>) {
      await cb();
    },
  } as unknown as DurableObjectState;

  return {
    state,
    storage: snapshotStorage,
    inspect: sqlStore.inspect,
  };
}