import { existsSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const PACKAGE_ROOT = join(__dirname, '..');
const REPO_ROOT = join(PACKAGE_ROOT, '..');

function trimVal(line: string): string {
  return line.trim().replace(/^['"]|['"]$/g, '');
}

function normalizeShopHost(raw: string): string {
  let s = trimVal(raw);
  s = s.replace(/^https?:\/\//i, '').split('/')[0];
  return s;
}

function parseDevVarsFile(path: string): Record<string, string> {
  const out: Record<string, string> = {};
  if (!existsSync(path)) return out;
  const content = readFileSync(path, 'utf8');
  for (const line of content.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const eq = trimmed.indexOf('=');
    if (eq <= 0) continue;
    const key = trimmed.slice(0, eq).trim();
    out[key] = trimVal(trimmed.slice(eq + 1));
  }
  return out;
}

/**
 * Bootstrap env z plików repo (jak scripts/*.mjs):
 * 1. epir-marketing-ingest/.env
 * 2. repo root .dev.vars  ← SHOPIFY_ADMIN_TOKEN + SHOP (custom app epir_ai)
 * 3. workers/marketing-ingest/.dev.vars (GA4_SERVICE_ACCOUNT_JSON)
 */
export function bootstrapEnv(): void {
  const localEnv = join(PACKAGE_ROOT, '.env');
  if (existsSync(localEnv)) {
    Object.assign(process.env, parseDevVarsFile(localEnv));
  }

  const devVarPaths = [
    join(REPO_ROOT, '.dev.vars'),
    join(REPO_ROOT, 'workers', 'marketing-ingest', '.dev.vars'),
    join(REPO_ROOT, 'workers', 'chat', '.dev.vars'),
  ];

  for (const path of devVarPaths) {
    const vars = parseDevVarsFile(path);
    for (const [key, value] of Object.entries(vars)) {
      if (!process.env[key]?.trim()) {
        process.env[key] = value;
      }
    }
  }

  const token =
    process.env.SHOPIFY_ADMIN_TOKEN?.trim() ||
    process.env.SHOPIFY_ADMIN_ACCESS_TOKEN?.trim() ||
    process.env.SHOPIFY_ACCESS_TOKEN?.trim() ||
    process.env.SHOPIFY_ADMIN_API_TOKEN?.trim();
  if (token && !process.env.SHOPIFY_ADMIN_TOKEN) {
    process.env.SHOPIFY_ADMIN_TOKEN = token;
  }

  const shop =
    process.env.SHOP?.trim() ||
    process.env.SHOPIFY_STORE?.trim() ||
    process.env.SHOPIFY_SHOP_DOMAIN?.trim() ||
    process.env.SHOP_DOMAIN?.trim();
  if (shop) {
    const normalized = normalizeShopHost(shop);
    process.env.SHOP = normalized;
    if (!process.env.SHOPIFY_STORE) {
      process.env.SHOPIFY_STORE = normalized;
    }
  }

  if (
    process.env.GA4_SERVICE_ACCOUNT_JSON?.trim() &&
    !process.env.GOOGLE_SERVICE_ACCOUNT_JSON?.trim()
  ) {
    process.env.GOOGLE_SERVICE_ACCOUNT_JSON =
      process.env.GA4_SERVICE_ACCOUNT_JSON;
  }
}

export function resolveShopifyAdminToken(): string {
  bootstrapEnv();
  const token =
    process.env.SHOPIFY_ADMIN_TOKEN?.trim() ||
    process.env.SHOPIFY_ADMIN_ACCESS_TOKEN?.trim() ||
    process.env.SHOPIFY_ACCESS_TOKEN?.trim() ||
    process.env.SHOPIFY_ADMIN_API_TOKEN?.trim();
  if (!token) {
    throw new Error(
      'Brak tokenu Shopify Admin API. Ustaw SHOPIFY_ADMIN_TOKEN w repo root .dev.vars (custom app epir_ai) lub w .env.',
    );
  }
  return token;
}

export function resolveShopDomain(fallback: string): string {
  bootstrapEnv();
  return (
    process.env.SHOP?.trim() ||
    process.env.SHOPIFY_STORE?.trim() ||
    fallback
  );
}

export function hasGoogleSheetsCredentials(): boolean {
  bootstrapEnv();
  return Boolean(
    process.env.GOOGLE_SERVICE_ACCOUNT_JSON?.trim() ||
      process.env.GOOGLE_APPLICATION_CREDENTIALS?.trim(),
  );
}
