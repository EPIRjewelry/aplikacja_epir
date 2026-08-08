import { pathToFileURL } from 'node:url';
import { writeFeedCsv } from './csv_export.js';
import {
  defaultCsvOutputPath,
  ensureParentDir,
  loadMappingConfig,
  loadSheetsConfig,
  loadShopifyConfig,
} from './config.js';
import {
  bootstrapEnv,
  hasGoogleSheetsCredentials,
  resolveShopifyAdminToken,
} from './credentials.js';
import { fetchAllProducts } from './shopify_client.js';
import { transformProducts } from './transform.js';
import type { GmcFeedRow, PipelineResult } from './types.js';

bootstrapEnv();

function log(message: string, meta?: Record<string, unknown>): void {
  const suffix = meta ? ` ${JSON.stringify(meta)}` : '';
  console.log(`[ingest] ${new Date().toISOString()} ${message}${suffix}`);
}

function readArg(prefix: string): string | null {
  const hit = process.argv.find((a) => a.startsWith(`${prefix}=`));
  return hit ? hit.slice(prefix.length + 1) : null;
}

export type RunOptions = {
  useAi?: boolean;
  dryRun?: boolean;
  csvPath?: string | null;
  previewCount?: number;
  productLimit?: number;
};

export async function runPipeline(options: RunOptions = {}): Promise<PipelineResult> {
  const startedAt = new Date();
  const errors: string[] = [];

  const shopifyConfig = loadShopifyConfig();
  const mappingConfig = loadMappingConfig();
  const token = resolveShopifyAdminToken();

  log('Fetching products from Shopify', {
    store: shopifyConfig.store,
    query: shopifyConfig.productQuery,
    apiVersion: shopifyConfig.apiVersion,
  });
  const products = await fetchAllProducts(shopifyConfig, token);
  const limited =
    options.productLimit && options.productLimit > 0
      ? products.slice(0, options.productLimit)
      : products;
  log('Products fetched', { count: limited.length, total: products.length });

  const variantCount = products.reduce((n, p) => n + p.variants.length, 0);
  log('Variants total', { count: variantCount });

  const useAi =
    options.useAi ?? Boolean(process.env.OPENROUTER_API_KEY?.trim());
  log('Transforming to GMC feed rows', { useAi });
  const feedRows = await transformProducts(
    limited,
    shopifyConfig,
    mappingConfig,
    { useAi },
  );
  log('Rows transformed', { count: feedRows.length });

  const previewCount = options.previewCount ?? 0;
  if (previewCount > 0) {
    for (const row of feedRows.slice(0, previewCount)) {
      log('preview row', row as unknown as Record<string, unknown>);
    }
  }

  let rowsWritten = 0;
  let outputTarget: PipelineResult['outputTarget'] = 'none';
  let outputPath: string | undefined;

  if (options.dryRun) {
    log('Dry run — skipping output');
  } else {
    const sheetsConfig = loadSheetsConfig();
    const csvPath = options.csvPath ?? readArg('--csv');
    const forceSheets = process.argv.includes('--sheets');

    if (csvPath !== null && csvPath !== undefined && !forceSheets) {
      const target =
        csvPath === '' || csvPath === 'auto'
          ? defaultCsvOutputPath()
          : csvPath;
      ensureParentDir(target);
      rowsWritten = writeFeedCsv(target, mappingConfig.gmcColumns, feedRows);
      outputTarget = 'csv';
      outputPath = target;
      log('Wrote CSV feed', { path: target, rows: rowsWritten });
    } else if (sheetsConfig && hasGoogleSheetsCredentials()) {
      const { writeFeedRows } = await import('./sheets_client.js');
      log('Writing to Google Sheets', {
        spreadsheetId: sheetsConfig.spreadsheetId,
        tab: sheetsConfig.tabName,
      });
      rowsWritten = await writeFeedRows(
        sheetsConfig,
        mappingConfig.gmcColumns,
        feedRows,
      );
      outputTarget = 'sheets';
    } else if (csvPath !== null) {
      const target =
        csvPath === '' || csvPath === 'auto'
          ? defaultCsvOutputPath()
          : csvPath;
      ensureParentDir(target);
      rowsWritten = writeFeedCsv(target, mappingConfig.gmcColumns, feedRows);
      outputTarget = 'csv';
      outputPath = target;
      log('Wrote CSV feed', { path: target, rows: rowsWritten });
    } else if (sheetsConfig && !hasGoogleSheetsCredentials()) {
      const target = defaultCsvOutputPath();
      ensureParentDir(target);
      rowsWritten = writeFeedCsv(target, mappingConfig.gmcColumns, feedRows);
      outputTarget = 'csv';
      outputPath = target;
      log('Sheets credentials missing — fallback CSV', {
        path: target,
        rows: rowsWritten,
      });
    } else {
      const target = defaultCsvOutputPath();
      ensureParentDir(target);
      rowsWritten = writeFeedCsv(target, mappingConfig.gmcColumns, feedRows);
      outputTarget = 'csv';
      outputPath = target;
      log('Default CSV output', { path: target, rows: rowsWritten });
    }
  }

  const finishedAt = new Date();
  const result: PipelineResult = {
    startedAt: startedAt.toISOString(),
    finishedAt: finishedAt.toISOString(),
    durationMs: finishedAt.getTime() - startedAt.getTime(),
    productsFetched: limited.length,
    rowsWritten,
    outputTarget,
    outputPath,
    errors,
  };

  log('Pipeline complete', summarizeResult(result, feedRows));
  return result;
}

function summarizeResult(
  result: PipelineResult,
  rows: GmcFeedRow[],
): Record<string, unknown> {
  const labels0 = countBy(rows, (r) => r.custom_label_0);
  const labels1 = countBy(rows, (r) => r.custom_label_1);
  const labels2 = countBy(rows, (r) => r.custom_label_2);
  return {
    ...result,
    custom_label_0: labels0,
    custom_label_1: labels1,
    custom_label_2: labels2,
  };
}

function countBy(
  rows: GmcFeedRow[],
  pick: (row: GmcFeedRow) => string,
): Record<string, number> {
  const out: Record<string, number> = {};
  for (const row of rows) {
    const key = pick(row) || '(empty)';
    out[key] = (out[key] ?? 0) + 1;
  }
  return out;
}

async function main(): Promise<void> {
  const noAi = process.argv.includes('--no-ai');
  const dryRun = process.argv.includes('--dry-run');
  const csvArg = readArg('--csv');
  const previewArg = readArg('--preview');
  const limitArg = readArg('--limit');
  const previewCount = previewArg ? Number.parseInt(previewArg, 10) : dryRun ? 3 : 0;
  const productLimit = limitArg ? Number.parseInt(limitArg, 10) : undefined;

  try {
    await runPipeline({
      useAi: !noAi,
      dryRun,
      csvPath: csvArg,
      previewCount: Number.isFinite(previewCount) ? previewCount : 3,
      productLimit: Number.isFinite(productLimit) ? productLimit : undefined,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error(`[ingest] FATAL: ${message}`);
    process.exitCode = 1;
  }
}

const isDirectRun =
  Boolean(process.argv[1]) &&
  import.meta.url === pathToFileURL(process.argv[1]).href;
if (isDirectRun) {
  void main();
}
