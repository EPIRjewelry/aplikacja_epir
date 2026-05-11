import { describe, expect, it, vi } from 'vitest';
import { TokenVaultDO, TokenVault } from '../src/token-vault';

type TokenRow = {
  token: string;
  customer_id: string;
  shop_id: string;
  created_at: number;
  last_used_at: number;
  expires_at: number | null;
};

class FakeSql {
  private readonly rows = new Map<string, TokenRow>();

  exec(sql: string, ...params: unknown[]) {
    const normalized = sql.replace(/\s+/g, ' ').trim().toLowerCase();

    if (normalized.startsWith('create table') || normalized.startsWith('create index')) {
      return this.result([]);
    }

    if (normalized.startsWith('select min(expires_at) as min_exp from token_mappings where expires_at is not null')) {
      let min: number | null = null;
      for (const row of this.rows.values()) {
        if (row.expires_at !== null && row.expires_at !== undefined) {
          if (min === null || row.expires_at < min) min = row.expires_at;
        }
      }
      return this.result([{ min_exp: min }]);
    }

    if (normalized.startsWith('select token, expires_at from token_mappings where customer_id = ? and shop_id = ?')) {
      const [customerId, shopId] = params as [string, string];
      const row = Array.from(this.rows.values()).find(
        (candidate) => candidate.customer_id === customerId && candidate.shop_id === shopId,
      );
      return this.result(row ? [{ token: row.token, expires_at: row.expires_at }] : []);
    }

    if (normalized.startsWith('update token_mappings set last_used_at = ? where token = ?')) {
      const [lastUsedAt, token] = params as [number, string];
      const row = this.rows.get(token);
      if (row) {
        row.last_used_at = lastUsedAt;
      }
      return this.result([]);
    }

    if (normalized.startsWith('update token_mappings set last_used_at = ?, expires_at = ? where token = ?')) {
      const [lastUsedAt, expiresAt, token] = params as [number, number, string];
      const row = this.rows.get(token);
      if (row) {
        row.last_used_at = lastUsedAt;
        row.expires_at = expiresAt;
      }
      return this.result([]);
    }

    if (normalized.startsWith('delete from token_mappings where token = ?')) {
      const [token] = params as [string];
      this.rows.delete(token);
      return this.result([]);
    }

    if (normalized.startsWith('delete from token_mappings where expires_at is not null and expires_at <= ?')) {
      const [cutoff] = params as [number];
      for (const [token, row] of this.rows.entries()) {
        if (row.expires_at !== null && row.expires_at <= cutoff) {
          this.rows.delete(token);
        }
      }
      return this.result([]);
    }

    if (normalized.startsWith('insert into token_mappings')) {
      const [token, customerId, shopId, createdAt, lastUsedAt, expiresAt] = params as [
        string,
        string,
        string,
        number,
        number,
        number | null,
      ];
      this.rows.set(token, {
        token,
        customer_id: customerId,
        shop_id: shopId,
        created_at: createdAt,
        last_used_at: lastUsedAt,
        expires_at: expiresAt,
      });
      return this.result([]);
    }

    if (
      normalized.startsWith(
        'select customer_id, shop_id, created_at, last_used_at, expires_at from token_mappings where token = ?',
      )
    ) {
      const [token] = params as [string];
      const row = this.rows.get(token);
      return this.result(row ? [row] : []);
    }

    if (normalized.startsWith('select expires_at from token_mappings where token = ?')) {
      const [token] = params as [string];
      const row = this.rows.get(token);
      return this.result(row ? [{ expires_at: row.expires_at }] : []);
    }

    throw new Error(`Unhandled SQL in test: ${sql}`);
  }

  private result<T>(rows: T[]) {
    return {
      toArray: () => rows,
      one: () => {
        if (rows.length !== 1) {
          throw new Error(
            rows.length === 0
              ? 'Expected exactly one result from SQL query, but got no results.'
              : `Expected exactly one result from SQL query, but got ${rows.length} results.`,
          );
        }
        return rows[0];
      },
    };
  }
}

function createDurableCtx(sql: FakeSql) {
  return {
    id: 'test-do',
    storage: {
      sql,
      setAlarm: vi.fn(async () => {}),
      deleteAlarm: vi.fn(async () => {}),
    },
  };
}

function createVault() {
  const sql = new FakeSql();
  const ctx = createDurableCtx(sql);
  return new TokenVaultDO(ctx as never, {});
}

function createVaultWithSql(sql: FakeSql) {
  const ctx = createDurableCtx(sql);
  return new TokenVaultDO(ctx as never, {});
}

describe('TokenVaultDO', () => {
  it('creates a self-routing token when mapping does not exist yet', async () => {
    const vault = createVault();

    const response = await vault.fetch(
      new Request('https://token-vault/get-or-create', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ customerId: 'cust-1', shopId: 'shop-1' }),
      }),
    );

    const payload = (await response.json()) as { token?: string };
    expect(response.status).toBe(200);
    expect(payload.token).toMatch(/^epir_[0-9a-f]+_\d+_[0-9a-f]{64}$/);
  });

  it('returns 404 for unknown token lookup instead of throwing', async () => {
    const vault = createVault();

    const response = await vault.fetch(
      new Request('https://token-vault/lookup', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token: 'missing-token' }),
      }),
    );

    expect(response.status).toBe(404);
  });

  it('returns valid=false for unknown token', async () => {
    const vault = createVault();

    const response = await vault.fetch(
      new Request('https://token-vault/is-valid', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token: 'missing-token' }),
      }),
    );

    const payload = (await response.json()) as { valid: boolean };
    expect(response.status).toBe(200);
    expect(payload.valid).toBe(false);
  });

  it('rehydrates token mapping after DO restart on shared SQL storage', async () => {
    const sql = new FakeSql();
    const firstInstance = createVaultWithSql(sql);

    const firstResponse = await firstInstance.fetch(
      new Request('https://token-vault/get-or-create', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ customerId: 'cust-restart', shopId: 'shop-restart' }),
      }),
    );
    const firstPayload = (await firstResponse.json()) as { token: string };

    const restartedInstance = createVaultWithSql(sql);
    const secondResponse = await restartedInstance.fetch(
      new Request('https://token-vault/get-or-create', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ customerId: 'cust-restart', shopId: 'shop-restart' }),
      }),
    );
    const secondPayload = (await secondResponse.json()) as { token: string };

    expect(secondPayload.token).toBe(firstPayload.token);
  });

  it('maps lookup payload into camelCase contract in TokenVault helper', async () => {
    const lookupBody = {
      customer_id: 'gid://shopify/Customer/42',
      shop_id: 'epirbizuteria.pl',
      created_at: 1,
      last_used_at: 2,
      expires_at: 3,
    };
    const stub = {
      fetch: async (_url: string, init?: RequestInit) => {
        const body = JSON.parse(String(init?.body ?? '{}')) as { token?: string };
        if (body.token !== 'known-token') {
          return new Response(JSON.stringify({ error: 'Token not found' }), { status: 404 });
        }
        return new Response(JSON.stringify(lookupBody), { status: 200 });
      },
    } as unknown as DurableObjectStub;
    const vault = new TokenVault(stub);

    const found = await vault.lookupToken('known-token');
    const missing = await vault.lookupToken('missing-token');

    expect(found).toEqual({
      customerId: 'gid://shopify/Customer/42',
      shopId: 'epirbizuteria.pl',
    });
    expect(missing).toBeNull();
  });

  it('returns valid=false for expired token without mutating row', async () => {
    const sql = new FakeSql();
    const ctx = createDurableCtx(sql);
    const vault = new TokenVaultDO(ctx as never, {});
    const past = Date.now() - 60_000;
    sql.exec(
      'INSERT INTO token_mappings (token, customer_id, shop_id, created_at, last_used_at, expires_at) VALUES (?, ?, ?, ?, ?, ?)',
      'epir_deadbeef_0_abcd00000000000000000000000000000000000000000000000000000000000000',
      'c1',
      's1',
      past,
      past,
      past,
    );

    const response = await vault.fetch(
      new Request('https://token-vault/is-valid', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          token: 'epir_deadbeef_0_abcd00000000000000000000000000000000000000000000000000000000000000',
        }),
      }),
    );
    const payload = (await response.json()) as { valid: boolean };
    expect(payload.valid).toBe(false);
    expect(ctx.storage.setAlarm).not.toHaveBeenCalled();
  });
});
