/** Gdy true — rekord streamu zawiera id, customer_id, order_id oraz eksport order_attributions. */
export function isPipelineExportExtendedFields(env: {
  PIPELINE_EXPORT_EXTENDED_FIELDS?: string;
}): boolean {
  const v = (env.PIPELINE_EXPORT_EXTENDED_FIELDS ?? '').trim().toLowerCase();
  return v === '1' || v === 'true' || v === 'yes';
}
