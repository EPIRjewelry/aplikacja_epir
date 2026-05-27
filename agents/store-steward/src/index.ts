/**
 * Store Steward — Cursor SDK runner (Faza 0).
 * Pobiera steward_insights z workera, generuje raport zrozumienia sklepu.
 *
 * Env:
 *   CURSOR_API_KEY — wymagany
 *   EPIR_ANALYST_ORIGIN lub EPIR_ANALYST_WORKER_ORIGIN — URL epir-analyst-worker
 *   ANALYST_HTTP_BEARER — ten sam Bearer co /v1/warehouse/query (jeden sekret zewnętrzny)
 *   STEWARD_GITHUB_REPO — opcjonalnie dla cloud (default EPIRjewelry/aplikacja_epir)
 */

import { Agent, CursorAgentError } from '@cursor/sdk';
import type { StewardInsightsResponse } from '@epir/steward-contract';
import { fetchStewardInsights, saveStewardReport } from './fetch-insights.js';
import { formatMissingEnvHelp, loadDotEnv, requireEnv, resolveAnalystOrigin } from './env.js';

loadDotEnv();

function formatInsightsPayload(data: StewardInsightsResponse): string {
  const lines: string[] = [
    `# Dane Store Steward (${data.period_start} → ${data.period_end})`,
    '',
    '## Sygnały (skrót)',
  ];
  for (const s of data.signals.slice(0, 40)) {
    lines.push(
      `- ${s.signal_key} / ${s.metric_name}: ${s.metric_value}${s.metric_unit ? ` ${s.metric_unit}` : ''}`,
    );
  }
  if (data.signals.length > 40) lines.push(`- … +${data.signals.length - 40} więcej`);
  lines.push('', '## Wnioski (steward_insights)');
  for (const i of data.insights) {
    lines.push(
      `- [${i.barrier ?? '—'}] (${(i.confidence * 100).toFixed(0)}%) ${i.summary}`,
    );
  }
  lines.push('', '## Hurtownia R2 SQL');
  for (const q of data.warehouse_queries) {
    lines.push(`- ${q.queryId}: ${q.ok ? `ok (${q.row_count} rows)` : `fail: ${q.error}`}`);
  }
  return lines.join('\n');
}

async function main(): Promise<void> {
  const dryRun = process.argv.includes('--dry-run');
  const apiKey = requireEnv('CURSOR_API_KEY');
  const analystOrigin = resolveAnalystOrigin();
  const bearer = requireEnv('ANALYST_HTTP_BEARER');

  const insights = await fetchStewardInsights({
    analystOrigin,
    bearer,
  });

  const contextBlock = formatInsightsPayload(insights);

  if (dryRun) {
    console.log('--- dry-run: insights payload ---');
    console.log(contextBlock);
    return;
  }

  const repoSlug = process.env.STEWARD_GITHUB_REPO?.trim() || 'EPIRjewelry/aplikacja_epir';
  const repoUrl = repoSlug.startsWith('http')
    ? repoSlug
    : `https://github.com/${repoSlug.replace(/^\/+|\/+$/g, '')}`;
  const prompt = `Jesteś Store Steward (Kustosz Sklepu) EPIR Art Jewellery — agent biznesowy, nie ratujesz pojedynczych koszyków.

Na podstawie poniższych danych z Fazy 0 (store_signals + steward_insights) napisz raport po polsku:

1. Co klienci robią na stronie w tym okresie?
2. Gdzie są największe tarcia w lejku (PDP → koszyk → checkout)?
3. Które produkty/kanały wyróżniają się (pozytywnie lub negatywnie)?
4. Jakie bariery (CENA, BRAK_INFO, TRUST, ROZMIAR, CZAS) są najbardziej prawdopodobne — z uzasadnieniem?
5. Co proponujesz na następny tydzień (tylko propozycje — Faza 0 bez wdrożeń w sklepie)?

Ton: właściciel marki luksusowej biżuterii, konkret, bez technicznego żargonu.

---
${contextBlock}
`;

  try {
    await using agent = await Agent.create({
      apiKey,
      model: { id: 'composer-2.5' },
      cloud: {
        repos: [{ url: repoUrl, startingRef: 'main' }],
        envVars: {
          STEWARD_PHASE: '0',
        },
      },
    });

    const run = await agent.send(prompt);
    let reportText = '';
    for await (const event of run.stream()) {
      if (event.type === 'assistant') {
        for (const block of event.message.content) {
          if (block.type === 'text') {
            process.stdout.write(block.text);
            reportText += block.text;
          }
        }
      }
    }
    const result = await run.wait();
    if (result.status === 'error') {
      console.error('\nRun failed:', result.id);
      process.exit(2);
    }

    if (reportText.trim()) {
      await saveStewardReport({
        analystOrigin,
        bearer,
        period_start: insights.period_start,
        period_end: insights.period_end,
        report_markdown: reportText.trim(),
        run_id: result.id,
        agent_id: agent.agentId,
      });
      console.log('\n\nReport saved to steward_reports.');
    }
  } catch (err) {
    if (err instanceof CursorAgentError) {
      console.error('Agent startup failed:', err.message, 'retryable=', err.isRetryable);
      process.exit(1);
    }
    throw err;
  }
}

main().catch((err) => {
  if (err instanceof Error && /Missing env|Missing analyst/i.test(err.message)) {
    console.error(err.message);
    console.error('\n' + formatMissingEnvHelp());
  } else {
    console.error(err);
  }
  process.exit(1);
});
