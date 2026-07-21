/**
 * Debug instrumentation (session 264a52). Safe in production — fetch no-ops on failure.
 */
export function epirDebugLog(
  location: string,
  message: string,
  data: Record<string, unknown>,
  hypothesisId: string,
  runId = 'batch-export',
): void {
  // #region agent log
  fetch('http://127.0.0.1:7457/ingest/49605965-4d1e-4f49-8545-82fd58eedfca', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-Debug-Session-Id': '264a52',
    },
    body: JSON.stringify({
      sessionId: '264a52',
      location,
      message,
      data,
      hypothesisId,
      runId,
      timestamp: Date.now(),
    }),
  }).catch(() => {});
  // #endregion
  console.log('[EDOG_DEBUG]', JSON.stringify({ location, message, hypothesisId, ...data }));
}
