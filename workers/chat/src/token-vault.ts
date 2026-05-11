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

/**
 * Wyciągnięte z self-routing tokenu pola routingu (bez pełnego secreta poza polem `secret`).
 * @see parseSelfRoutingToken
 */
export type SelfRoutingTokenParts = {
  shopId: string;
  shardId: number;
  /** Ostatni segment (losowy); pełny token = `epir_<shopHex>_<shardId>_<secret>`. */
  secret: string;
};

/** @deprecated Użyj {@link SelfRoutingTokenParts}. */
export type ParsedSelfRoutingToken = SelfRoutingTokenParts;

// ——— HTTP RPC (Worker ↔ DO `fetch`): deterministyczne body/odpowiedzi ———

export type TokenVaultRpcGetOrCreateArgs = {
  customerId: string;
  shopId: string;
};

/** Sukces mint / reuse: jeden token self-routing lub istniejący ważny. */
export type TokenMintOk = { token: string };

export type TokenMintError = { error: string };

export type TokenMintResult = TokenMintOk | TokenMintError;

export type TokenVaultRpcDeleteArgs =
  | { token: string }
  | { customerId: string; shopId: string };

export type TokenVaultDeleteOk = { deleted: true };

export type TokenVaultDeleteResult = TokenVaultDeleteOk | TokenMintError;

export type TokenVaultRpcLookupArgs = {
  token: string;
};

/** Wiersz z SQLite (snake_case) — kontrakt HTTP `lookup` przy 200. */
export type VaultLookupRow = {
  customer_id: string;
  shop_id: string;
  created_at: number;
  last_used_at: number;
  expires_at: number | null;
};

export type VaultLookupResult = VaultLookupRow | TokenMintError;

export type TokenVaultRpcIsValidArgs = {
  token: string;
};

export type VaultIsValidOk = { valid: boolean };

export type VaultIsValidResult = VaultIsValidOk;

export function isTokenMintOk(r: TokenMintResult): r is TokenMintOk {
  return 'token' in r && typeof (r as TokenMintOk).token === 'string';
}

export function isVaultLookupOk(r: VaultLookupResult): r is VaultLookupRow {
  return 'customer_id' in r && 'shop_id' in r;
}

/**
 * Parsuje self-routing token `epir_<shopHex>_<shardId>_<cryptoHex>`.
 * Zwraca canonical `shopId` (UTF-8 z shopHex) oraz `secret` (= crypto segment).
 */
export function parseSelfRoutingToken(token: string): SelfRoutingTokenParts | null {
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

export type TokenVaultRouteCustomer = { kind: 'customer'; shopId: string; customerId: string };
export type TokenVaultRouteShard = { kind: 'shard'; shopId: string; shardId: number };
/**
 * Routowanie po surowym `token`:
 * - self-routing (`epir_…`) → shard z tokenu,
 * - legacy 64 hex → **tylko** z `fallbackShopId` na DO `shop:<canonical>`.
 */
export type TokenVaultRouteToken = { kind: 'token'; token: string; fallbackShopId?: string };

export type TokenVaultRoute = TokenVaultRouteCustomer | TokenVaultRouteShard | TokenVaultRouteToken;

/**
 * Zwraca stub DO dla wskazanego shardu lub legacy vaultu.
 *
 * **Preconditions:** dla `kind: 'customer'` — niepuste stringi; dla `kind: 'token'` z legacy opaque — wymagany `fallbackShopId`.
 * **Postconditions:** stub wskazuje na `idFromName` dla `canonicalShop#shard` albo `shop:<canonical>` (legacy).
 * **Throws:** gdy token nieparsowalny i nie legacy, lub legacy bez `fallbackShopId`.
 *
 * Nowe tokeny **nigdy** nie używają ścieżki singleton `shop:<shop>` — wyłącznie migracja legacy.
 */
export function getTokenVaultStub(
  ns: DurableObjectNamespace,
  env: TokenVaultEnv,
  route: TokenVaultRoute,
): DurableObjectStub {
  switch (route.kind) {
    case 'token': {
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
    case 'shard':
      return ns.get(ns.idFromName(buildShardDurableObjectName(route.shopId, route.shardId)));
    case 'customer': {
      const shard = shardIdForCustomer(route.customerId, getVaultShardCount(env));
      return ns.get(ns.idFromName(buildShardDurableObjectName(route.shopId, shard)));
    }
    default: {
      const _exhaustive: never = route;
      throw new Error(`TokenVault: unknown route kind ${_exhaustive as string}`);
    }
  }
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

async function readJsonBody(request: Request): Promise<{ ok: false; response: Response } | { ok: true; body: unknown }> {
  try {
    const body: unknown = await request.json();
    return { ok: true, body };
  } catch {
    const err: TokenMintError = { error: 'Invalid JSON body' };
    return {
      ok: false,
      response: new Response(JSON.stringify(err), {
        status: 400,
        headers: { 'Content-Type': 'application/json' },
      }),
    };
  }
}

/**
 * TokenVaultDO — shardowany skarbiec tokenów (SQLite w DO).
 * Mint zawsze self-routing (`epir_…`) na shardzie `stableHash(customerId) % shardCount`; TTL przesuwane przy get-or-create/lookup.
 * Wygasłe wiersze: alarm `storage.setAlarm(MIN(expires_at))` + opcjonalny cleanup przy mutacjach.
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

  /** Usuwa wygasłe wiersze, planuje kolejny alarm na najbliższe `expires_at`. */
  async alarm(): Promise<void> {
    const now = Date.now();
    this.sql.exec('DELETE FROM token_mappings WHERE expires_at IS NOT NULL AND expires_at <= ?', now);
    await this.rescheduleExpiryAlarm();
  }

  /** Router HTTP-RPC wewnętrzny; ścieżki: `…/get-or-create`, `delete`, `lookup`, `is-valid`. */
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

  /**
   * **Preconditions:** JSON `{ customerId, shopId }` (niepuste). Klient wywołuje stub już dla właściwego shardu.
   * **Postconditions:** przy sukcesie `{ token }` mint lub reuse z przesuniętym TTL; alarm zsynchronizowany z MIN(expires).
   */
  private async handleGetOrCreate(request: Request): Promise<Response> {
    const parsed = await readJsonBody(request);
    if (!parsed.ok) return parsed.response;

    const body = parsed.body as Partial<TokenVaultRpcGetOrCreateArgs>;
    const { customerId, shopId } = body;

    if (!customerId || !shopId) {
      const err: TokenMintError = { error: 'Missing customerId or shopId' };
      return new Response(JSON.stringify(err), {
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
        const ok: TokenMintOk = { token: existing.token };
        return new Response(JSON.stringify(ok), {
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

    const ok: TokenMintOk = { token };
    return new Response(JSON.stringify(ok), {
      headers: { 'Content-Type': 'application/json' },
    });
  }

  /**
   * **Preconditions:** body `{ token }` **xor** `{ customerId, shopId }` (wszystkie niepuste w wybranej gałęzi).
   * **Postconditions:** usunięte dopasowane wiersze; alarm przeliczony; `{ deleted: true }`.
   */
  private async handleDelete(request: Request): Promise<Response> {
    const parsed = await readJsonBody(request);
    if (!parsed.ok) return parsed.response;

    const body = parsed.body as Partial<TokenVaultRpcDeleteArgs> & Record<string, unknown>;
    const token = typeof body.token === 'string' ? body.token : undefined;
    const customerId = typeof body.customerId === 'string' ? body.customerId : undefined;
    const shopId = typeof body.shopId === 'string' ? body.shopId : undefined;

    if (token !== undefined && token.length > 0) {
      this.sql.exec('DELETE FROM token_mappings WHERE token = ?', token);
    } else if (customerId && shopId) {
      this.sql.exec(
        'DELETE FROM token_mappings WHERE customer_id = ? AND shop_id = ?',
        customerId,
        normalizeShopId(shopId),
      );
    } else {
      const err: TokenMintError = { error: 'Missing token or customerId+shopId' };
      return new Response(JSON.stringify(err), {
        status: 400,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    this.cleanupExpiredOptional(Date.now());
    await this.rescheduleExpiryAlarm();

    const ok: TokenVaultDeleteOk = { deleted: true };
    return new Response(JSON.stringify(ok), {
      headers: { 'Content-Type': 'application/json' },
    });
  }

  /**
   * **Preconditions:** `{ token }` niepuste.
   * **Postconditions:** przy 200 zwraca `VaultLookupRow` i przesuwa TTL (jak użycie); 404 jak brak lub po wygaśnięciu; alarm zaktualizowany przy udanym prolongowaniu.
   */
  private async handleLookup(request: Request): Promise<Response> {
    const parsed = await readJsonBody(request);
    if (!parsed.ok) return parsed.response;

    const body = parsed.body as Partial<TokenVaultRpcLookupArgs>;
    const { token } = body;
    const now = Date.now();
    const ttl = this.tokenTtlMs();

    if (!token) {
      const err: TokenMintError = { error: 'Missing token' };
      return new Response(JSON.stringify(err), {
        status: 400,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    const result = this.queryFirst<VaultLookupRow>(
      'SELECT customer_id, shop_id, created_at, last_used_at, expires_at FROM token_mappings WHERE token = ? LIMIT 1',
      token,
    );

    if (!result) {
      const err: TokenMintError = { error: 'Token not found' };
      return new Response(JSON.stringify(err), {
        status: 404,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    if (result.expires_at !== null && result.expires_at !== undefined && now > result.expires_at) {
      const err: TokenMintError = { error: 'Token not found' };
      return new Response(JSON.stringify(err), {
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

    return new Response(JSON.stringify(result satisfies VaultLookupResult), {
      headers: { 'Content-Type': 'application/json' },
    });
  }

  /**
   * **Preconditions:** JSON (dowolne); `{ token?: string }`.
   * **Postconditions:** wyłącznie SELECT; brak modyfikacji wierszy i alarmów. Zwraca `{ valid }`.
   */
  private async handleIsValid(request: Request): Promise<Response> {
    const parsed = await readJsonBody(request);
    if (!parsed.ok) return parsed.response;

    const body = parsed.body as Partial<TokenVaultRpcIsValidArgs>;
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
 * Klient stub-a namespace `TOKEN_VAULT_DO`: HTTP-RPC do konkretnego shardu lub legacy vaultu (wyłącznie przez dobór stub-a).
 *
 * Routowanie do właściwego DO pozostaje poza klasą ({@link getTokenVaultStub}); ta klasa zakłada poprawnie dobrany `stub`.
 */
export class TokenVault {
  constructor(private stub: DurableObjectStub) {}

  /**
   * **Preconditions:** `customerId` i `shopId` niepuste; stub musi reprezentować shard tego klienta.
   * **Postconditions:** zwraca `epir_…` token lub istniejący ważny; rzuca przy błędzie HTTP/biznesowym.
   */
  async getOrCreateToken(customerId: string, shopId: string): Promise<string> {
    const response = await this.stub.fetch('https://token-vault/get-or-create', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ customerId, shopId } satisfies TokenVaultRpcGetOrCreateArgs),
    });

    const result = (await response.json()) as TokenMintResult;
    if (!isTokenMintOk(result)) {
      throw new Error(`TokenVault error: ${result.error}`);
    }
    return result.token;
  }

  /**
   * **Postconditions:** kasuje wpis dla pary klient–sklep jeśli istnieje; ignoruje nie-2xx dopóki wywołujący nie sprawdzi (minimalny kontrakt).
   */
  async deleteToken(customerId: string, shopId: string): Promise<void> {
    await this.stub.fetch('https://token-vault/delete', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ customerId, shopId } satisfies Extract<TokenVaultRpcDeleteArgs, { customerId: string }>),
    });
  }

  /** **Postconditions:** kasuje konkretny wiersz po wartości `token` jeśli w tym shardzie występuje. */
  async deleteTokenByValue(token: string): Promise<void> {
    await this.stub.fetch('https://token-vault/delete', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ token } satisfies Extract<TokenVaultRpcDeleteArgs, { token: string }>),
    });
  }

  /**
   * **Postconditions:** przy trafieniu zwraca `{ customerId, shopId }` (camelCase); przy 404 lub błędzie — `null`.
   * Przedłuża TTL po stronie DO (jak `lookup`).
   */
  async lookupToken(token: string): Promise<{ customerId: string; shopId: string } | null> {
    const response = await this.stub.fetch('https://token-vault/lookup', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ token }),
    });

    if (response.status === 404) {
      return null;
    }

    const payload = (await response.json()) as VaultLookupResult;

    if (!isVaultLookupOk(payload)) {
      return null;
    }

    return { customerId: payload.customer_id, shopId: payload.shop_id };
  }

  /**
   * **Postconditions:** tylko odczyt po stronie DO (`is-valid`); `true` wtedy i tylko wtedy, gdy wiersz istnieje i `now <= expires_at` (lub brak expiry).
   */
  async isTokenValid(token: string): Promise<boolean> {
    const response = await this.stub.fetch('https://token-vault/is-valid', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ token } satisfies TokenVaultRpcIsValidArgs),
    });

    const result = (await response.json()) as VaultIsValidResult;
    return result.valid;
  }
}
