const partCount = 28;

const code = `async () => {
  const keys = Array.from({ length: ${partCount} }, (_, i) => 'gmc_feed.csv.part' + String(i).padStart(2, '0'));
  const chunks = [];
  for (const key of keys) {
    const res = await cloudflare.request({
      method: 'GET',
      path: \`/accounts/\${accountId}/r2/buckets/epir-gmc-feed/objects/\${key}\`,
    });
    if (!res.success) {
      throw new Error('Missing part ' + key);
    }
    chunks.push(res.result);
  }
  const body = chunks.join('');
  const put = await cloudflare.request({
    method: 'PUT',
    path: \`/accounts/\${accountId}/r2/buckets/epir-gmc-feed/objects/gmc_feed.csv\`,
    body,
    contentType: 'text/csv',
  });
  const deleted = [];
  for (const key of keys) {
    deleted.push(await cloudflare.request({
      method: 'DELETE',
      path: \`/accounts/\${accountId}/r2/buckets/epir-gmc-feed/objects/\${key}\`,
    }));
  }
  return { bytes: body.length, put, deletedCount: deleted.length };
}`;

process.stdout.write(JSON.stringify({ code }));
