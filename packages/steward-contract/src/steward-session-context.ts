/**
 * Kontrakt mostu Kustosz → Gemma (Faza 1).
 * Gemma odczyta ten kształt z SessionDO po wdrożeniu route `/set-steward-context`.
 */

export type { StewardSessionContext } from './index.js';
export { STEWARD_CONTRACT_VERSION, STEWARD_BARRIERS, isStewardBarrier } from './index.js';
