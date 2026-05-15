/**
 * Cloudflare Pipelines HTTP ingest — POST tablicy JSON.
 * @see workers/bigquery-batch/src/pipeline-ingest.ts (ten sam kontrakt)
 */
export async function postPipelineIngestBatch(
  ingestUrl: string | undefined,
  bearerToken: string | undefined,
  records: Record<string, unknown>[],
): Promise<{ ok: true } | { ok: false; status: number; body: string }> {
  const url = (ingestUrl ?? '').trim();
  if (!url || records.length === 0) {
    return { ok: true };
  }
  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  const token = (bearerToken ?? '').trim();
  if (token) {
    headers.Authorization = `Bearer ${token}`;
  }
  const res = await fetch(url, {
    method: 'POST',
    headers,
    body: JSON.stringify(records),
  });
  if (!res.ok) {
    const body = (await res.text()).slice(0, 500);
    return { ok: false, status: res.status, body };
  }
  return { ok: true };
}
