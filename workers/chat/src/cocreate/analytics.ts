import type { Env } from '../config/bindings';
import type { CocreatePersistedBrief } from './types';

export async function emitCocreateSubmittedEvent(
  env: Env,
  row: CocreatePersistedBrief,
): Promise<void> {
  if (!env.ANALYTICS_WORKER) return;

  let brief: Record<string, unknown> = {};
  try {
    brief = JSON.parse(row.briefJson) as Record<string, unknown>;
  } catch {
    brief = {};
  }

  try {
    await env.ANALYTICS_WORKER.fetch('https://analytics.internal/pixel', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        type: 'cocreate_form_submitted',
        data: {
          reference_id: row.referenceId,
          storefront_id: row.storefrontId,
          channel: row.channel,
          has_attachment: Boolean(row.r2Key),
          jewelry_type: brief.jewelryType ?? null,
          budget_band: brief.budgetBand ?? null,
          consent_marketing: row.consentMarketing,
          source: 'cocreate_app_proxy',
        },
      }),
    });
  } catch (error) {
    console.warn('[cocreate] analytics emit failed:', error);
  }
}
