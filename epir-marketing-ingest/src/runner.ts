import { pathToFileURL } from 'node:url';
import { writeFeedCsv } from './csv_export.js';
import {
  defaultCsvOutputPath,
  ensureParentDir,
  loadMappingConfig,
  loadOutputConfig,
  loadR2Config,
  loadSheetsConfig,
  loadShopifyConfig,
} from './config.js';
import {
  bootstrapEnv,
  hasGoogleSheetsCredentials,
  resolveShopifyAdminToken,
} from './credentials.js';
import { isR2Configured, uploadFeedToR2 } from './r2_client.js';
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

type SinkMode = 'r2' | 'csv' | 'sheets';

function resolveSinkMode(): SinkMode {
  const output = loadOutputConfig();
  if (process.argv.includes('--sheets')) return 'sheets';
  if (process.argv.includes('--r2')) return 'r2';
  if (process.argv.includes('--csv') || readArg('--csv') !== null) return 'csv';
  return output.defaultSink;
}

export async function runPipeline(options: RunOptions = {}): Promise<PipelineResult> {
  const startedAt = new Date();
  const errors: string[] = [];

  const shopifyConfig = loadShopifyConfig();
  const mappingConfig = loadMappingConfig();
  const outputConfig = loadOutputConfig();
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

  const variantCount = limited.reduce((n, p) => n + p.variants.length, 0);
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
  let publicFeedUrl: string | undefined;

  if (options.dryRun) {
    log('Dry run — skipping output');
  } else {
    const sink = resolveSinkMode();
    const r2Config = loadR2Config();
    const csvTarget =
      options.csvPath === '' || options.csvPath === 'auto' || readArg('--csv') === 'auto'
        ? defaultCsvOutputPath()
        : options.csvPath ?? readArg('--csv') ?? defaultCsvOutputPath();

    const writeLocalCsv = (): string => {
      ensureParentDir(csvTarget);
      rowsWritten = writeFeedCsv(csvTarget, mappingConfig.gmcColumns, feedRows);
      outputPath = csvTarget;
      return csvTarget;
    };

    if (sink === 'r2' && isR2Configured(r2Config)) {
      const localPath =
        outputConfig.localCsvBackup || !isR2Configured(r2Config)
          ? writeLocalCsv()
          : (() => {
              const tmp = defaultCsvOutputPath();
              ensureParentDir(tmp);
              writeFeedCsv(tmp, mappingConfig.gmcColumns, feedRows);
              return tmp;
            })();
      if (!outputConfig.localCsvBackup) {
        rowsWritten = feedRows.length;
      }
      publicFeedUrl = await uploadFeedToR2(localPath, r2Config!);
      outputTarget = outputConfig.localCsvBackup ? 'r2+csv' : 'r2';
      log('Uploaded feed to R2', {
        bucket: r2Config!.bucket,
        key: r2Config!.objectKey,
        publicFeedUrl,
        localBackup: outputConfig.localCsvBackup ? localPath : undefined,
      });
    } else if (sink === 'csv' || !isR2Configured(r2Config)) {
      writeLocalCsv();
      outputTarget = 'csv';
      log('Wrote CSV feed', { path: csvTarget, rows: rowsWritten });
      if (sink === 'r2' && !isR2Configured(r2Config)) {
        log('R2 not configured — fallback CSV only (set config/r2.json)');
      }
    } else if (sink === 'sheets' && outputConfig.sheetsEnabled) {
      await writeToGoogleSheets(mappingConfig, feedRows, (count) => {
        rowsWritten = count;
        outputTarget = 'sheets';
      });
    } else if (sink === 'sheets' && !outputConfig.sheetsEnabled) {
      log(
        'Google Sheets sink disabled (config/output.json sheetsEnabled:false). Using CSV.',
      );
      writeLocalCsv();
      outputTarget = 'csv';
    } else {
      writeLocalCsv();
      outputTarget = 'csv';
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
    publicFeedUrl,
    errors,
  };

  log('Pipeline complete', summarizeResult(result, feedRows));
  return result;
}

/**
 * Google Sheets — legacy sink (wyłączony domyślnie).
 * Zobacz: src/sheets_sink.legacy.ts
 */
async function writeToGoogleSheets(
  mappingConfig: ReturnType<typeof loadMappingConfig>,
  feedRows: GmcFeedRow[],
  onSuccess: (rowsWritten: number) => void,
): Promise<void> {
  const sheetsConfig = loadSheetsConfig();
  if (!sheetsConfig || !hasGoogleSheetsCredentials()) {
    throw new Error(
      'Sheets sink requested but missing sheets.json or Google credentials',
    );
  }
  const { writeFeedRows } = await import('./sheets_sink.legacy.js');
  log('Writing to Google Sheets (legacy)', {
    spreadsheetId: sheetsConfig.spreadsheetId,
    tab: sheetsConfig.tabName,
  });
  const count = await writeFeedRows(
    sheetsConfig,
    mappingConfig.gmcColumns,
    feedRows,
  );
  onSuccess(count);
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
