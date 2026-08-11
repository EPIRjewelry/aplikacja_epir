/**
 * LEGACY: Google Sheets sink — wyłączony domyślnie (config/output.json → sheetsEnabled: false).
 *
 * Powód: GCP + Workspace (udostępnianie service account, Sheets API) — wysoka frakcja operacyjna.
 * Docelowy sink: R2 public URL → GMC Scheduled fetch.
 *
 * Re-włączenie:
 *   1. config/output.json → "sheetsEnabled": true
 *   2. GOOGLE_APPLICATION_CREDENTIALS lub GOOGLE_SERVICE_ACCOUNT_JSON
 *   3. config/sheets.json + udostępnienie arkusza kontu usługi
 *   4. npm run ingest -- --no-ai --sheets
 */
export { clearSheetRange, rowsToSheetValues, writeFeedRows } from './sheets_client.js';
