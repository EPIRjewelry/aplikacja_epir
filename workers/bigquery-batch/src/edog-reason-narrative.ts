/**
 * EDOG — ludzka narracja PL dla operatora (bez I/O).
 */
import type { FlowHealthReport } from './edog-flow-health-runner';

export type EdogLayerId = 'capture' | 'd1' | 'batch' | 'pipeline' | 'warehouse' | 'consumers';

export type EdogNarrative = {
  diagnosis: string;
  layers: { id: EdogLayerId; label: string; status: 'OK' | 'FAIL' | 'WARN' | 'SKIP'; detail: string }[];
  working: string[];
  actions: string[];
  markdown: string;
};

const MAX_PIXEL_ROWS_PER_RUN = 2500;

function isoMs(ms: number | null | undefined): string {
  if (ms == null || !Number.isFinite(ms) || ms <= 0) return 'brak';
  return new Date(ms).toISOString();
}

function batchAgeHours(report: FlowHealthReport): number | null {
  const updated = report.batch_exports?.updated_at ?? 0;
  if (updated <= 0) return null;
  return (Date.parse(report.checked_at) - updated) / 3_600_000;
}

function estimateExportRuns(pending: number): number {
  if (pending <= 0) return 0;
  return Math.ceil(pending / MAX_PIXEL_ROWS_PER_RUN);
}

function layerFromReasons(reasons: string[]): EdogLayerId[] {
  const layers = new Set<EdogLayerId>();
  for (const r of reasons) {
    if (r.startsWith('pipeline_') || r === 'pipeline_pixel_not_configured') layers.add('pipeline');
    if (r.includes('pending_pixel') || r.includes('batch_exports') || r === 'batch_exports_or_pending_unavailable')
      layers.add('batch');
    if (r.startsWith('warehouse_')) layers.add('warehouse');
    if (r === 'no_pixel_events_24h') layers.add('capture');
  }
  if (layers.size === 0 && reasons.includes('ok')) return ['capture', 'd1', 'batch', 'pipeline', 'warehouse'];
  if (!layers.has('batch') && reasons.some((x) => x.includes('pixel'))) layers.add('d1');
  return [...layers];
}

function decodeReason(reason: string): string {
  if (reason === 'ok') return 'Wszystkie progi EDOG w normie.';
  if (reason === 'pipeline_pixel_not_configured')
    return 'Brak sekretu PIPELINE_PIXEL_INGEST_URL na workerze epir-bigquery-batch — eksport D1→Iceberg nie startuje.';
  if (reason === 'batch_exports_never_updated')
    return 'Tabela batch_exports nigdy nie została zaktualizowana (watermark = 0).';
  if (reason === 'batch_exports_or_pending_unavailable')
    return 'Nie udało się odczytać backlogu pending ani batch_exports z D1.';
  if (reason.startsWith('pending_pixel_events_critical:'))
    return `Krytyczny backlog: ${reason.split(':')[1]} zdarzeń pixel w D1 czeka na eksport (próg FAIL ≥ 10 000).`;
  if (reason.startsWith('pending_pixel_events_elevated:'))
    return `Podwyższony backlog: ${reason.split(':')[1]} zdarzeń pixel do wyeksportowania (próg DEGRADED ≥ 1 000).`;
  if (reason.startsWith('batch_exports_stale_hours:'))
    return `Ostatnia udana aktualizacja batch_exports była ${reason.split(':')[1]} h temu (próg FAIL ≥ 48 h).`;
  if (reason.startsWith('batch_exports_lag_hours:'))
    return `Opóźnienie eksportu: ${reason.split(':')[1]} h od ostatniej aktualizacji batch_exports (próg DEGRADED ≥ 26 h).`;
  if (reason === 'no_pixel_events_24h') return 'Brak zdarzeń pixel w D1 w ostatnich 24 h.';
  if (reason === 'warehouse_q1_empty') return 'Sonda Q1 (R2 SQL) zwróciła 0 wierszy.';
  if (reason === 'warehouse_q1_skipped_batch_unhealthy')
    return 'Sonda Q1 pominięta — batch/backlog w stanie FAIL lub DEGRADED.';
  if (reason.startsWith('warehouse_q1_error:'))
    return `Błąd sondy Q1: ${reason.slice('warehouse_q1_error:'.length)}`;
  return reason;
}

export function buildEdogNarrative(report: FlowHealthReport): EdogNarrative {
  const reasons = report.reasons?.length ? report.reasons : ['ok'];
  const fail = report.edog_verdict === 'FAIL';
  const degraded = report.edog_verdict === 'DEGRADED';
  const batchH = batchAgeHours(report);
  const pending = report.pending_pixel_events;
  const touched = layerFromReasons(reasons);

  const captureOk = report.d1_pixel_events_24h > 0;
  const batchOk = !fail && !degraded && pending < 1000 && (batchH ?? 0) < 26;
  const pipelineOk = report.pipeline_pixel_configured;
  const warehouseOk = report.warehouse_q1_ok;

  const layers: EdogNarrative['layers'] = [
    {
      id: 'capture',
      label: 'Capture (Web Pixel → analytics worker)',
      status: captureOk ? 'OK' : fail ? 'FAIL' : 'WARN',
      detail: captureOk
        ? `${report.d1_pixel_events_24h} zdarzeń pixel w D1 (24 h).`
        : 'Brak zdarzeń pixel w ostatnich 24 h — sprawdź pixel na storefrontach.',
    },
    {
      id: 'd1',
      label: 'D1 operacyjne (jewelry-analytics-db)',
      status: pending < 0 ? 'FAIL' : pending >= 10_000 ? 'FAIL' : pending >= 1000 ? 'WARN' : 'OK',
      detail:
        pending < 0
          ? 'Nie odczytano backlogu pending_pixel_events.'
          : `${pending} zdarzeń oczekuje za watermarkiem last_pixel_export_at.`,
    },
    {
      id: 'batch',
      label: 'Batch (epir-bigquery-batch cron 02:00 UTC)',
      status:
        batchH == null || batchH >= 48 || reasons.includes('batch_exports_never_updated')
          ? 'FAIL'
          : batchH >= 26
            ? 'WARN'
            : batchOk
              ? 'OK'
              : 'WARN',
      detail: `batch_exports.updated_at: ${isoMs(report.batch_exports?.updated_at)}; last_pixel_export_at: ${isoMs(report.batch_exports?.last_pixel_export_at)}${batchH != null ? `; wiek ${batchH.toFixed(1)} h` : ''}.`,
    },
    {
      id: 'pipeline',
      label: 'Pipeline (HTTP ingest → Iceberg)',
      status: pipelineOk ? (fail && touched.includes('pipeline') ? 'FAIL' : 'OK') : 'FAIL',
      detail: pipelineOk
        ? 'PIPELINE_PIXEL_INGEST_URL skonfigurowany.'
        : 'PIPELINE_PIXEL_INGEST_URL brak — cron kończy się bez eksportu i bez odświeżenia watermarku.',
    },
    {
      id: 'warehouse',
      label: 'Hurtownia (R2 SQL / Iceberg)',
      status: report.warehouse_q1_skipped ? 'SKIP' : warehouseOk ? 'OK' : fail ? 'FAIL' : 'WARN',
      detail: report.warehouse_q1_skipped
        ? report.warehouse_q1_error
          ? `Pominięto: ${report.warehouse_q1_error}`
          : 'Sonda Q1 wyłączona dopóki batch nie jest zdrowy.'
        : warehouseOk
          ? `Q1 OK (${report.warehouse_q1_row_count ?? 0} wierszy).`
          : 'Q1 nie potwierdziło danych w hurtowni.',
    },
    {
      id: 'consumers',
      label: 'Konsumenci (Operator Studio, run_analytics_query)',
      status: report.edog_verdict === 'PASS' ? 'OK' : 'FAIL',
      detail:
        report.edog_verdict === 'PASS'
          ? 'run_analytics_query i Q8 w raporcie dziennym mają sens.'
          : 'Przy FAIL EDOG interpretacja metryk hurtowni jest zawodna — najpierw napraw batch.',
    },
  ];

  const working: string[] = [];
  if (captureOk) working.push(`Pixel zbiera dane: ${report.d1_pixel_events_24h} zdarzeń / 24 h.`);
  if (report.d1_messages_24h > 0)
    working.push(`Wiadomości czatu w D1: ${report.d1_messages_24h} / 24 h.`);
  if (pipelineOk && !touched.includes('pipeline')) working.push('Konfiguracja pipeline pixel jest obecna.');
  if (report.edog_verdict === 'PASS') working.push('Pełny łańcuch capture→hurtownia operacyjnie zdrowy.');

  const actions: string[] = [];
  if (!pipelineOk) {
    actions.push('Ustaw PIPELINE_PIXEL_INGEST_URL (+ opcjonalnie PIPELINE_INGEST_TOKEN) na epir-bigquery-batch.');
  }
  if (batchH != null && batchH >= 26) {
    actions.push('Sprawdź logi epir-bigquery-batch ([WAREHOUSE_BATCH]) i czy cron 0 2 * * * UTC się wykonuje.');
  }
  if (pending > 1000) {
    const runs = estimateExportRuns(pending);
    actions.push(
      `POST /internal/operator-studio/api/trigger-warehouse-export — powtórz ok. ${runs}× (limit ${MAX_PIXEL_ROWS_PER_RUN} wierszy/run).`,
    );
  }
  if (report.warehouse_q1_skipped && pending < 10_000 && (batchH ?? 999) < 48) {
    actions.push('Po spadku backlogu uruchom ponownie flow-health — Q1 powinno się wykonać.');
  }
  if (actions.length === 0 && report.edog_verdict !== 'PASS') {
    actions.push('Odśwież flow-health po 24 h i porównaj pending oraz batch_exports.updated_at.');
  }

  const diagnosis =
    report.edog_verdict === 'PASS'
      ? 'Przepływ danych EPIR jest operacyjnie zdrowy (EDOG: PASS).'
      : report.edog_verdict === 'DEGRADED'
        ? `Przepływ w stanie obniżonym (EDOG: DEGRADED). ${reasons.map(decodeReason).join(' ')}`
        : `Przepływ wymaga naprawy (EDOG: FAIL). Głównie warstwa: ${touched.join(', ') || 'batch/pipeline'}. ${reasons.map(decodeReason).join(' ')}`;

  const markdown = formatEdogNarrativeMarkdown(report, { diagnosis, layers, working, actions, reasons });
  return { diagnosis, layers, working, actions, markdown };
}

export function formatEdogNarrativeMarkdown(
  report: FlowHealthReport,
  parts: Pick<EdogNarrative, 'diagnosis' | 'layers' | 'working' | 'actions'> & { reasons: string[] },
): string {
  const lines: string[] = [
    '## Diagnoza EDOG',
    '',
    parts.diagnosis,
    '',
    `**Werdykt:** \`${report.edog_verdict}\` | **Sprawdzono:** ${report.checked_at}`,
    '',
    '### Warstwy',
    '',
    '| Warstwa | Status | Szczegół |',
    '|---------|--------|----------|',
    ...parts.layers.map((l) => `| ${l.label} | ${l.status} | ${l.detail.replace(/\|/g, '/')} |`),
    '',
    '### Powody (kody)',
    '',
    ...parts.reasons.map((r) => `- \`${r}\` — ${decodeReason(r)}`),
    '',
    '### Metryki',
    '',
    `- pending_pixel_events: **${report.pending_pixel_events}**`,
    `- d1_pixel_events_24h: ${report.d1_pixel_events_24h}`,
    `- d1_messages_24h: ${report.d1_messages_24h}`,
    `- pipeline_pixel: ${report.pipeline_pixel_configured ? 'tak' : 'nie'}`,
    `- pipeline_messages: ${report.pipeline_messages_configured ? 'tak' : 'nie'}`,
    `- batch_exports.updated_at: ${isoMs(report.batch_exports?.updated_at)}`,
    `- batch_exports.last_pixel_export_at: ${isoMs(report.batch_exports?.last_pixel_export_at)}`,
    `- warehouse_q1_ok: ${report.warehouse_q1_ok} (skipped: ${report.warehouse_q1_skipped})`,
  ];
  if (report.pending_pixel_events > 0) {
    lines.push(
      `- szac. przebiegów eksportu do opróżnienia backlogu: **${estimateExportRuns(report.pending_pixel_events)}** (po naprawie pipeline)`,
    );
  }
  if (parts.working.length) {
    lines.push('', '### Co działa', '', ...parts.working.map((w) => `- ${w}`));
  }
  if (parts.actions.length) {
    lines.push('', '### Co zrobić teraz', '', ...parts.actions.map((a) => `1. ${a}`));
  }
  return lines.join('\n');
}
