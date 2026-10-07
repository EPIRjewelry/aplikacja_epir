/**
 * Mapowanie wartości opcji wariantu „Jakość” na pochodzenie.
 * Zatwierdzone przez właściciela 2026-10-07 (D1). Nowe wartości dopisuje właściciel po raporcie.
 */
import type {GemstoneOrigin} from './types';

export const QUALITY_OPTION_TO_ORIGIN: ReadonlyMap<string, GemstoneOrigin> = new Map([
  ['lab', 'lab_grown'],
  ['black', 'natural'],
  ['d/vvs2', 'natural'],
  ['f/vs2', 'natural'],
  ['g/si', 'natural'],
  ['g/vs2', 'natural'],
]);

/**
 * Mapowanie wartości metapola produktu `custom.gemstone_origin`.
 */
export const PRODUCT_METAFIELD_ORIGIN: ReadonlyMap<string, GemstoneOrigin> = new Map([
  ['naturalny', 'natural'],
  ['laboratoryjny', 'lab_grown'],
  ['hodowlana', 'cultured'],
  ['do wyboru', 'unknown'],
  ['mieszane', 'mixed'],
]);
