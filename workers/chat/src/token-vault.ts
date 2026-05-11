/**
 * token-vault.ts
 * Skarbiec tokenów dla customer_id (Shopify) — Cloudflare Durable Object
 * - Self-routing token: `epir_<shopHex>_<shardId>_<cryptoHex>` (bez KV/D1 map)
 *   - shopHex = lowercase hex(UTF-8 canonical shop host), żeby segment nie zawierał `_`
 *     (separator tokenu). Canonical shop: trim + toLowerCase (np. myshopify.com).
 * - Shard DO: `idFromName(\`${normalizeShopId(shop)}#${shardId}\`)` — spójnie z tokenem.
 * - sharding: shardId = stableHash(customerId) % VAULT_SHARD_COUNT (16–64 z env).
 * - TTL: sliding window; alarm po MIN(expires_at); `is-valid` tylko SELECT (read-only).
 * - Legacy (migracja): 64 znaki hex bez prefiksu `epir_` → DO `shop:<canonicalShop>` (wymaga
 *   fallbackShopId przy routingu ze workerów).
 */

import { DurableObject } from 'cloudflare:workers';

export interface TokenVaultEnv {
  VAULT_SHARD_COUNT?: string;
  TOKEN_TTL_MS?: string;
}

const DEFAULT_VAULT_SHARD_COUNT = 32;
const DEFAULT_TOKEN_TTL_MS = 1000 * 60 * 60 * 24 * 30; // 30 days

const LEGACY_SHOP_PREFIX = 'shop';

/** Publiczny segment losowy w self-routing token (hex, bez `_`). */
const SELF_ROUTING_SECRET_BYTES = 32;

export function normalizeShopId(shopId: string): string {
  return shopId.trim().toLowerCase();
}

export function getVaultShardCount(env: TokenVaultEnv): number {
  const raw = env.VAULT_SHARD_COUNT;
  const n = raw !== undefined && raw !== '' ? Number.parseInt(String(raw), 10) : DEFAULT_VAULT_SHARD_COUNT;
  if (!Number.isFinite(n) || n < 1) return DEFAULT_VAULT_SHARD_COUNT;
  return Math.min(64, Math.max(16, Math.floor(n)));
}

export function getTokenTtlMs(env: TokenVaultEnv): number {
  const raw = env.TOKEN_TTL_MS;
  const n = raw !== undefined && raw !== '' ? Number.parseInt(String(raw), 10) : DEFAULT_TOKEN_TTL_MS;
  if (!Number.isFinite(n) || n < 60_000) return DEFAULT_TOKEN_TTL_MS;
  return Math.floor(n);
}

/** FNV-1a 32-bit — deterministyczny shard per customerId. */
export function stableHashCustomerId(customerId: string): number {
  let h = 2166136261;
  for (let i = 0; i < customerId.length; i++) {
    h ^= customerId.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

export function shardIdForCustomer(customerId: string, shardCount: number): number {
  if (shardCount <= 0) return 0;
  return stableHashCustomerId(customerId) % shardCount;
}

/** Nowy klucz DO: `canonicalShop#shard` */
export function buildShardDurableObjectName(shopId: string, shardId: number): string {
  return `${normalizeShopId(shopId)}#${shardId}`;
}

/** Legacy migracja: jeden DO na sklep (stare tokeny 64-hex). */
export function buildLegacyTokenVaultShardName(shopId: string): string {
  return `${LEGACY_SHOP_PREFIX}:${normalizeShopId(shopId)}`;
}

/**
 * @deprecated Użyj `buildShardDurableObjectName` + `getTokenVaultStub`; zachowane dla
 * kompatybilności nazewnictwa (stary shard `shop:<shop>`).
 */
export function buildTokenVaultShardName(shopId: string): string {
  return buildLegacyTokenVaultShardName(shopId);
}

function utf8ToHex(s: string): string {
  const bytes = new TextEncoder().encode(s);
  let out = '';
  for (let i = 0; i < bytes.length; i++) {
    out += bytes[i]!.toString(16).padStart(2, '0');
  }
  return out;
}

function hexToUtf8(hex: string): string | null {
  if (hex.length % 2 !== 0 || !/^[0-9a-fA-F]+$/.test(hex)) return null;
  const buf = new Uint8Array(hex.length / 2);
  for (let i = 0; i < buf.length; i++) {
    buf[i] = Number.parseInt(hex.slice(i * 2, i * 2 + 2), 16);
  }
  try {
    return new TextDecoder('utf-8', { fatal: true }).decode(buf);
  } catch {
    return null;
  }
}

export type ParsedSelfRoutingToken = {
  shopId: string;
  shardId: number;
  /** Ostatni segment (losowy); pełny token = `epir_<shopHex>_<shardId>_<secret>`. */
  secret: string;
};

/**
 * Parsuje self-routing token `epir_<shopHex>_<shardId>_<cryptoHex>`.
 * Zwraca canonical `shopId` (UTF-8 z shopHex) oraz `secret` (= crypto segment).
 */
export function parseSelfRoutingToken(token: string): ParsedSelfRoutingToken | null {
  if (!token.startsWith('epir_')) return null;
  const parts = token.split('_');
  if (parts.length !== 4 || parts[0] !== 'epir') return null;
  const shopHex = parts[1]!;
  const shardStr = parts[2]!;
  const secret = parts[3]!;
  if (!/^[0-9a-f]+$/i.test(shopHex) || !/^\d+$/.test(shardStr) || !/^[0-9a-f]+$/i.test(secret)) {
    return null;
  }
  const shardId = Number.parseInt(shardStr, 10);
  if (!Number.isFinite(shardId) || shardId < 0) return null;
  const shopId = hexToUtf8(shopHex);
  if (shopId === null || shopId.length === 0) return null;
  return { shopId: normalizeShopId(shopId), shardId, secret };
}

/** Stary format: dokładnie 64 hex (SHA-256 style), bez prefiksu epir_. */
export function looksLikeLegacyOpaqueToken(token: string): boolean {
  return /^[a-f0-9]{64}$/i.test(token) && !token.startsWith('epir_');
}

export type TokenVaultRoute =
  | { shopId: string; customerId: string }
  | { shopId: string; shardId: number }
  | { token: string; fallbackShopId?: string };

/**
 * Stub DO vault bez zewnętrznych lookupów: z tokenu (self-routing), z (shop, customer), lub (shop, shard).
 */
export function getTokenVaultStub(
  ns: DurableObjectNamespace,
  env: TokenVaultEnv,
  route: TokenVaultRoute,
): DurableObjectStub {
  if ('token' in route) {
    const parsed = parseSelfRoutingToken(route.token);
    if (parsed) {
      const name = buildShardDurableObjectName(parsed.shopId, parsed.shardId);
      return ns.get(ns.idFromName(name));
    }
    if (looksLikeLegacyOpaqueToken(route.token)) {
      const shop = route.fallbackShopId;
      if (!shop) {
        throw new Error('TokenVault: legacy opaque token requires fallbackShopId for routing');
      }
      return ns.get(ns.idFromName(buildLegacyTokenVaultShardName(shop)));
    }
    throw new Error('TokenVault: unrecognized token format for routing');
  }
  if ('shardId' in route) {
    return ns.get(ns.idFromName(buildShardDurableObjectName(route.shopId, route.shardId)));
  }
  const shard = shardIdForCustomer(route.customerId, getVaultShardCount(env));
  return ns.get(ns.idFromName(buildShardDurableObjectName(route.shopId, shard)));
}

function randomHex(bytes: number): string {
  const u = new Uint8Array(bytes);
  crypto.getRandomValues(u);
  let s = '';
  for (let i = 0; i < u.length; i++) s += u[i]!.toString(16).padStart(2, '0');
  return s;
}

function buildSelfRoutingToken(shopId: string, shardId: number): string {
  const shopCanon = normalizeShopId(shopId);
  const shopHex = utf8ToHex(shopCanon);
  return `epir_${shopHex}_${shardId}_${randomHex(SELF_ROUTING_SECRET_BYTES)}`;
}

/**
 * TokenVaultDO - Durable Object dla persystentnego przechowywania tokenów
 */
export class TokenVaultDO extends DurableObject {
  private sql = this.ctx.storage.sql;
  private readonly vaultEnv: TokenVaultEnv;

  constructor(ctx: DurableObjectState, env: TokenVaultEnv) {
    super(ctx, env);
    this.vaultEnv = env;

    this.sql.exec(`
      CREATE TABLE IF NOT EXISTS token_mappings (
        token TEXT PRIMARY KEY,
        customer_id TEXT NOT NULL,
        shop_id TEXT NOT NULL,
        created_at INTEGER NOT NULL,
        last_used_at INTEGER NOT NULL,
        expires_at INTEGER
      )
    `);

    this.sql.exec(`
      CREATE INDEX IF NOT EXISTS idx_customer_shop 
      ON token_mappings(customer_id, shop_id)
    `);
  }

  private tokenTtlMs(): number {
    return getTokenTtlMs(this.vaultEnv);
  }

  private shardCount(): number {
    return getVaultShardCount(this.vaultEnv);
  }

  private queryFirst<T>(sql: string, ...bindings: unknown[]): T | null {
    const rows = this.sql.exec(sql, ...bindings).toArray() as T[];
    return rows[0] ?? null;
  }

  /** Defense-in-depth: lekki cleanup (primary = alarm). */
  private cleanupExpiredOptional(now: number): void {
    this.sql.exec('DELETE FROM token_mappings WHERE expires_at IS NOT NULL AND expires_at <= ?', now);
  }

  private async rescheduleExpiryAlarm(): Promise<void> {
    const row = this.queryFirst<{ min_exp: number | null }>(
      'SELECT MIN(expires_at) AS min_exp FROM token_mappings WHERE expires_at IS NOT NULL',
    );
    const minExp = row?.min_exp ?? null;
    if (minExp === null || minExp === undefined) {
      await this.ctx.storage.deleteAlarm();
      return;
    }
    await this.ctx.storage.setAlarm(minExp);
  }

  async alarm(): Promise<void> {
    const now = Date.now();
    this.sql.exec('DELETE FROM token_mappings WHERE expires_at IS NOT NULL AND expires_at <= ?', now);
    await this.rescheduleExpiryAlarm();
  }

  async fetch(request: Request): Promise<Response> {
    const url = new URL(request.url);
    const action = url.pathname.split('/').pop();

    if (action === 'get-or-create') {
      return this.handleGetOrCreate(request);
    }
    if (action === 'delete') {
      return this.handleDelete(request);
    }
    if (action === 'lookup') {
      return this.handleLookup(request);
    }
    if (action === 'is-valid') {
      return this.handleIsValid(request);
    }

    return new Response('Not Found', { status: 404 });
  }

  private async handleGetOrCreate(request: Request): Promise<Response> {
    const body = (await request.json()) as { customerId?: string; shopId?: string };
    const { customerId, shopId } = body;

    if (!customerId || !shopId) {
      return new Response(JSON.stringify({ error: 'Missing customerId or shopId' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    const now = Date.now();
    const ttl = this.tokenTtlMs();
    const expectedShard = shardIdForCustomer(customerId, this.shardCount());

    const existing = this.queryFirst<{ token: string; expires_at: number | null }>(
      'SELECT token, expires_at FROM token_mappings WHERE customer_id = ? AND shop_id = ? LIMIT 1',
      customerId,
      normalizeShopId(shopId),
    );

    if (existing) {
      if (existing.expires_at !== null && existing.expires_at !== undefined && now > existing.expires_at) {
        this.sql.exec('DELETE FROM token_mappings WHERE token = ?', existing.token);
      } else {
        this.sql.exec(
          'UPDATE token_mappings SET last_used_at = ?, expires_at = ? WHERE token = ?',
          now,
          now + ttl,
          existing.token,
        );
        await this.rescheduleExpiryAlarm();
        return new Response(JSON.stringify({ token: existing.token }), {
          headers: { 'Content-Type': 'application/json' },
        });
      }
    }

    const shopCanon = normalizeShopId(shopId);
    const token = buildSelfRoutingToken(shopCanon, expectedShard);
    this.sql.exec(
      'INSERT INTO token_mappings (token, customer_id, shop_id, created_at, last_used_at, expires_at) VALUES (?, ?, ?, ?, ?, ?)',
      token,
      customerId,
      shopCanon,
      now,
      now,
      now + ttl,
    );
    await this.rescheduleExpiryAlarm();

    return new Response(JSON.stringify({ token }), {
      headers: { 'Content-Type': 'application/json' },
    });
  }

  private async handleDelete(request: Request): Promise<Response> {
    const body = (await request.json()) as { customerId?: string; shopId?: string; token?: string };
    const { customerId, shopId, token } = body;

    if (token) {
      this.sql.exec('DELETE FROM token_mappings WHERE token = ?', token);
    } else if (customerId && shopId) {
      this.sql.exec(
        'DELETE FROM token_mappings WHERE customer_id = ? AND shop_id = ?',
        customerId,
        normalizeShopId(shopId),
      );
    } else {
      return new Response(JSON.stringify({ error: 'Missing token or customerId+shopId' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    this.cleanupExpiredOptional(Date.now());
    await this.rescheduleExpiryAlarm();

    return new Response(JSON.stringify({ deleted: true }), {
      headers: { 'Content-Type': 'application/json' },
    });
  }

  private async handleLookup(request: Request): Promise<Response> {
    const body = (await request.json()) as { token?: string };
    const { token } = body;
    const now = Date.now();
    const ttl = this.tokenTtlMs();

    if (!token) {
      return new Response(JSON.stringify({ error: 'Missing token' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    const result = this.queryFirst<{
      customer_id: string;
      shop_id: string;
      created_at: number;
      last_used_at: number;
      expires_at: number | null;
    }>(
      'SELECT customer_id, shop_id, created_at, last_used_at, expires_at FROM token_mappings WHERE token = ? LIMIT 1',
      token,
    );

    if (!result) {
      return new Response(JSON.stringify({ error: 'Token not found' }), {
        status: 404,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    if (result.expires_at !== null && result.expires_at !== undefined && now > result.expires_at) {
      return new Response(JSON.stringify({ error: 'Token not found' }), {
        status: 404,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    this.sql.exec(
      'UPDATE token_mappings SET last_used_at = ?, expires_at = ? WHERE token = ?',
      now,
      now + ttl,
      token,
    );
    await this.rescheduleExpiryAlarm();

    return new Response(JSON.stringify(result), {
      headers: { 'Content-Type': 'application/json' },
    });
  }

  /**
   * Read-only: brak UPDATE, brak alarmów, brak przesuwania TTL.
   */
  private async handleIsValid(request: Request): Promise<Response> {
    const body = (await request.json()) as { token?: string };
    const { token } = body;
    const now = Date.now();

    if (!token) {
      return new Response(JSON.stringify({ valid: false }), {
        headers: { 'Content-Type': 'application/json' },
      });
    }

    const result = this.queryFirst<{ expires_at: number | null }>(
      'SELECT expires_at FROM token_mappings WHERE token = ? LIMIT 1',
      token,
    );

    if (!result) {
      return new Response(JSON.stringify({ valid: false }), {
        headers: { 'Content-Type': 'application/json' },
      });
    }

    const valid = result.expires_at === null || result.expires_at === undefined || now <= result.expires_at;
    return new Response(JSON.stringify({ valid }), {
      headers: { 'Content-Type': 'application/json' },
    });
  }
}

/**
 * Helper class dla łatwego użycia w index.ts
 */
export class TokenVault {
  constructor(private stub: DurableObjectStub) {}

  async getOrCreateToken(customerId: string, shopId: string): Promise<string> {
    const response = await this.stub.fetch('https://token-vault/get-or-create', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ customerId, shopId }),
    });

    const result = (await response.json()) as { token?: string; error?: string };
    if (result.error) {
      throw new Error(`TokenVault error: ${result.error}`);
    }
    return result.token!;
  }

  async deleteToken(customerId: string, shopId: string): Promise<void> {
    await this.stub.fetch('https://token-vault/delete', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ customerId, shopId }),
    });
  }

  async deleteTokenByValue(token: string): Promise<void> {
    await this.stub.fetch('https://token-vault/delete', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ token }),
    });
  }

  async lookupToken(token: string): Promise<{ customerId: string; shopId: string } | null> {
    const response = await this.stub.fetch('https://token-vault/lookup', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ token }),
    });

    if (response.status === 404) {
      return null;
    }

    const payload = (await response.json()) as {
      customerId?: string;
      shopId?: string;
      customer_id?: string;
      shop_id?: string;
      error?: string;
    };

    if (payload.error) {
      return null;
    }

    const customerId = payload.customerId ?? payload.customer_id;
    const shopId = payload.shopId ?? payload.shop_id;
    if (!customerId || !shopId) {
      throw new Error('TokenVault error: lookup response missing customer/shop identifiers');
    }
    return { customerId, shopId };
  }

  async isTokenValid(token: string): Promise<boolean> {
    const response = await this.stub.fetch('https://token-vault/is-valid', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ token }),
    });

    const result = (await response.json()) as { valid: boolean };
    return result.valid;
  }
}
