/**
 * Profil operatora — v1 w sessionStorage (Faza 2).
 * Docelowo: D1 internal_operator_profile (EPIR_PROJECT_B_COPILOT_VISION §4).
 */
export const OPERATOR_PROFILE_STORAGE_KEY = 'epir_operator_studio_profile';

export type OperatorProfileV1 = {
  readonly brandNotes: string;
  readonly defaultWorkflowId: string;
  readonly campaignPriorities?: string;
};

export const DEFAULT_OPERATOR_PROFILE: OperatorProfileV1 = {
  brandNotes: '',
  defaultWorkflowId: 'data_warehouse',
};

export function operatorProfileDefaultsJson(): string {
  return JSON.stringify(DEFAULT_OPERATOR_PROFILE);
}
