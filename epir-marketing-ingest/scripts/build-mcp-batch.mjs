import fs from 'node:fs';
import path from 'node:path';

const dir = path.resolve('.upload-chunks-b64');
const batchIndex = Number(process.argv[2] ?? '0');
const batchSize = Number(process.env.BATCH_SIZE ?? process.argv[3] ?? 1);

const files = fs
  .readdirSync(dir)
  .filter((f) => f.endsWith('.b64'))
  .sort();

const start = batchIndex * batchSize;
const batch = files.slice(start, start + batchSize);
if (batch.length === 0) {
  console.error('No chunks for batch', batchIndex);
  process.exit(1);
}

const parts = batch.map((file) => {
  const match = file.match(/part-(\d+)\.b64$/);
  const index = match?.[1] ?? '00';
  return {
    key: `gmc_feed.csv.part${index}`,
    b64: fs.readFileSync(path.join(dir, file), 'utf8'),
  };
});

const code = `async () => {
  const parts = ${JSON.stringify(parts)};
  const results = [];
  for (const part of parts) {
    const binary = Uint8Array.from(atob(part.b64), c => c.charCodeAt(0));
    results.push(await cloudflare.request({
      method: 'PUT',
      path: \`/accounts/\${accountId}/r2/buckets/epir-gmc-feed/objects/\${part.key}\`,
      body: binary,
      contentType: 'application/octet-stream',
      rawBody: true,
    }));
  }
  return { batch: ${batchIndex}, uploaded: parts.map(p => p.key), results };
}`;

process.stdout.write(JSON.stringify({ code }));
