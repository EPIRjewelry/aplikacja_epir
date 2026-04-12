import { describe, expect, it } from 'vitest';
import { TokenVaultDO } from '../src/token-vault';

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

    if (normalized.startsWith('delete from token_mappings where token = ?')) {
      const [token] = params as [string];
      this.rows.delete(token);
      return this.result([]);
    }

    if (normalized.startsWith('insert into token_mappings')) {
      const [token, customerId, shopId, createdAt, lastUsedAt, expiresAt] = params as [string, string, string, number, number, number | null];
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

    if (normalized.startsWith('select customer_id, shop_id, created_at, last_used_at, expires_at from token_mappings where token = ?')) {
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

function createVault() {
  const sql = new FakeSql();
  const ctx = { storage: { sql } };
  return new TokenVaultDO(ctx as never, {});
}

describe('TokenVaultDO', () => {
  it('creates a token when mapping does not exist yet', async () => {
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
    expect(payload.token).toMatch(/^[a-f0-9]{64}$/);
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
});