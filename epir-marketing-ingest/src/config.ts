import { readFileSync, mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { bootstrapEnv, resolveShopDomain } from './credentials.js';
import type { MappingConfig, ShopifyConfig, SheetsConfig } from './types.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const PACKAGE_ROOT = join(__dirname, '..');
const CONFIG_DIR = join(PACKAGE_ROOT, 'config');
const REPO_ROOT = join(PACKAGE_ROOT, '..');

function readJson<T>(filename: string): T {
  const raw = readFileSync(join(CONFIG_DIR, filename), 'utf8');
  return JSON.parse(raw) as T;
}

export function loadShopifyConfig(): ShopifyConfig {
  bootstrapEnv();
  const config = readJson<ShopifyConfig>('shopify.json');
  config.store = resolveShopDomain(config.store);
  if (process.env.SHOPIFY_PRODUCT_QUERY?.trim()) {
    config.productQuery = process.env.SHOPIFY_PRODUCT_QUERY.trim();
  }
  return config;
}

export function loadSheetsConfig(): SheetsConfig | null {
  bootstrapEnv();
  const config = readJson<SheetsConfig>('sheets.json');
  if (process.env.SHEETS_SPREADSHEET_ID?.trim()) {
    config.spreadsheetId = process.env.SHEETS_SPREADSHEET_ID.trim();
  }
  if (process.env.SHEETS_TAB_NAME?.trim()) {
    const tab = process.env.SHEETS_TAB_NAME.trim();
    config.tabName = tab;
    config.clearRange = `${tab}!A:Z`;
    config.writeRange = `${tab}!A1`;
  }
  if (
    !config.spreadsheetId ||
    config.spreadsheetId === 'YOUR_SPREADSHEET_ID'
  ) {
    return null;
  }
  return config;
}

export function loadMappingConfig(): MappingConfig {
  return readJson<MappingConfig>('mapping.json');
}

export function defaultCsvOutputPath(): string {
  const date = new Date().toISOString().slice(0, 10);
  return join(REPO_ROOT, '..', 'marketing', 'csv', `gmc_feed_${date}.csv`);
}

export function ensureParentDir(filePath: string): void {
  mkdirSync(dirname(filePath), { recursive: true });
}
