import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import type { R2Config } from './types.js';

const execFileAsync = promisify(execFile);

export function resolveR2Config(config: R2Config): R2Config {
  return {
    bucket: process.env.R2_BUCKET_NAME?.trim() || config.bucket,
    objectKey: process.env.R2_OBJECT_KEY?.trim() || config.objectKey,
    publicFeedUrl:
      process.env.R2_PUBLIC_FEED_URL?.trim() || config.publicFeedUrl,
  };
}

export function isR2Configured(config: R2Config | null): boolean {
  if (!config?.bucket || config.bucket === 'YOUR_R2_BUCKET') return false;
  return true;
}

/**
 * Upload feed CSV to R2 via Wrangler CLI (uses `wrangler login` session).
 * Bucket must exist: `npx wrangler r2 bucket create epir-gmc-feed`
 */
export async function uploadFeedToR2(
  localFilePath: string,
  config: R2Config,
): Promise<string> {
  const resolved = resolveR2Config(config);
  const objectPath = `${resolved.bucket}/${resolved.objectKey}`;

  await execFileAsync(
    process.platform === 'win32' ? 'npx.cmd' : 'npx',
    ['wrangler', 'r2', 'object', 'put', objectPath, '--file', localFilePath, '--remote'],
    { windowsHide: true },
  );

  return resolved.publicFeedUrl;
}
