/**
 * Mapowanie audience signals (CRM) per asset group PMax.
 * Uwaga: PMax = max 1 audience signal per asset group — wiele list CRM łączymy w jedną Audience.
 */
export const DEFAULT_PMAX_CAMPAIGN_FOR_AUDIENCES = 'Epir_Forest-Dark';

/** Nazwy list CRM (user_list.name) składane w jedną audiencję sygnału. */
export const PMAX_AUDIENCE_SIGNALS_BY_ASSET_GROUP: Record<string, string[]> = {
  EPIR_Srebro: ['EPIR_CRM_Email_Consent', 'EPIR_CRM_Repeat'],
  EPIR_Zloto: ['EPIR_CRM_Email_Consent', 'EPIR_CRM_High_Value'],
  'Grupa plików 1': ['EPIR_CRM_Email_Consent', 'EPIR_CRM_Repeat'],
};

export const PMAX_AUDIENCE_NAME_BY_ASSET_GROUP: Record<string, string> = {
  EPIR_Srebro: 'EPIR_AG_Srebro_CRM',
  EPIR_Zloto: 'EPIR_AG_Zloto_CRM',
  'Grupa plików 1': 'EPIR_AG_Srebro_CRM',
};

export function resolveAudienceListNames(assetGroupName: string): string[] | { error: string } {
  const key = assetGroupName.trim();
  const lists = PMAX_AUDIENCE_SIGNALS_BY_ASSET_GROUP[key];
  if (!lists?.length) {
    return {
      error: `unknown asset group for audience signals: ${key} (EPIR_Srebro | EPIR_Zloto)`,
    };
  }
  return [...lists];
}

export function resolveCombinedAudienceName(assetGroupName: string): string {
  return PMAX_AUDIENCE_NAME_BY_ASSET_GROUP[assetGroupName.trim()] ?? `EPIR_AG_${assetGroupName.trim()}_CRM`;
}
