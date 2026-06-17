/**
 * Profil operatora — D1 `internal_operator_profile` (Operator Studio).
 */
export const OPERATOR_PROFILE_STORAGE_KEY = 'epir_operator_studio_profile';

export type OperatorProfileV1 = {
  readonly brandNotes: string;
  readonly campaignPriorities?: string;
};

export const DEFAULT_OPERATOR_PROFILE: OperatorProfileV1 = {
  brandNotes: '',
  campaignPriorities: '',
};

export function operatorProfileDefaultsJson(): string {
  return JSON.stringify(DEFAULT_OPERATOR_PROFILE);
}
